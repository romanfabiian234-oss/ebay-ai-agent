#!/usr/bin/env python3
"""Minimal modern macOS Keychain helper for internal Native Messaging credentials.

Uses SecItem* with the data-protection keychain and
kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly. This module is intentionally
small and stores no values outside Keychain.
"""
from __future__ import annotations

import ctypes
import sys


class KeychainError(RuntimeError):
    pass


class DataProtectionKeychain:
    ERR_SEC_SUCCESS = 0
    ERR_SEC_ITEM_NOT_FOUND = -25300
    UTF8 = 0x08000100  # kCFStringEncodingUTF8

    def __init__(self) -> None:
        if sys.platform != "darwin":
            raise KeychainError("macOS Keychain is available only on macOS.")
        try:
            self.security = ctypes.cdll.LoadLibrary(
                "/System/Library/Frameworks/Security.framework/Security"
            )
            self.cf = ctypes.cdll.LoadLibrary(
                "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation"
            )
        except OSError as error:
            raise KeychainError("macOS Security framework could not be loaded.") from error

        self.cf.CFDictionaryCreateMutable.argtypes = [ctypes.c_void_p, ctypes.c_long, ctypes.c_void_p, ctypes.c_void_p]
        self.cf.CFDictionaryCreateMutable.restype = ctypes.c_void_p
        self.cf.CFDictionarySetValue.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p]
        self.cf.CFDictionarySetValue.restype = None
        self.cf.CFStringCreateWithCString.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_uint32]
        self.cf.CFStringCreateWithCString.restype = ctypes.c_void_p
        self.cf.CFDataCreate.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_uint8), ctypes.c_long]
        self.cf.CFDataCreate.restype = ctypes.c_void_p
        self.cf.CFDataGetLength.argtypes = [ctypes.c_void_p]
        self.cf.CFDataGetLength.restype = ctypes.c_long
        self.cf.CFDataGetBytePtr.argtypes = [ctypes.c_void_p]
        self.cf.CFDataGetBytePtr.restype = ctypes.POINTER(ctypes.c_uint8)
        self.cf.CFRelease.argtypes = [ctypes.c_void_p]
        self.cf.CFRelease.restype = None

        self.security.SecItemCopyMatching.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p)]
        self.security.SecItemCopyMatching.restype = ctypes.c_int32
        self.security.SecItemAdd.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p)]
        self.security.SecItemAdd.restype = ctypes.c_int32
        self.security.SecItemUpdate.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
        self.security.SecItemUpdate.restype = ctypes.c_int32
        self.security.SecItemDelete.argtypes = [ctypes.c_void_p]
        self.security.SecItemDelete.restype = ctypes.c_int32

        self.kSecClass = self._symbol(self.security, "kSecClass")
        self.kSecClassGenericPassword = self._symbol(self.security, "kSecClassGenericPassword")
        self.kSecAttrService = self._symbol(self.security, "kSecAttrService")
        self.kSecAttrAccount = self._symbol(self.security, "kSecAttrAccount")
        self.kSecValueData = self._symbol(self.security, "kSecValueData")
        self.kSecReturnData = self._symbol(self.security, "kSecReturnData")
        self.kSecMatchLimit = self._symbol(self.security, "kSecMatchLimit")
        self.kSecMatchLimitOne = self._symbol(self.security, "kSecMatchLimitOne")
        self.kSecAttrAccessible = self._symbol(self.security, "kSecAttrAccessible")
        self.kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly = self._symbol(
            self.security, "kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly"
        )
        self.kSecUseDataProtectionKeychain = self._symbol(self.security, "kSecUseDataProtectionKeychain")
        self.kCFBooleanTrue = self._symbol(self.cf, "kCFBooleanTrue")

    @staticmethod
    def _symbol(library, name: str) -> ctypes.c_void_p:
        try:
            return ctypes.c_void_p(ctypes.c_void_p.in_dll(library, name).value)
        except ValueError as error:
            raise KeychainError(f"Required macOS Keychain symbol is unavailable: {name}") from error

    def _string(self, value: str) -> ctypes.c_void_p:
        ref = self.cf.CFStringCreateWithCString(None, str(value).encode("utf-8"), self.UTF8)
        if not ref:
            raise KeychainError("Could not create Keychain string value.")
        return ctypes.c_void_p(ref)

    def _data(self, value: str) -> ctypes.c_void_p:
        raw = str(value).encode("utf-8")
        if not raw:
            raise KeychainError("Refusing to store an empty Keychain value.")
        array = (ctypes.c_uint8 * len(raw)).from_buffer_copy(raw)
        ref = self.cf.CFDataCreate(None, array, len(raw))
        if not ref:
            raise KeychainError("Could not create Keychain data value.")
        return ctypes.c_void_p(ref)

    def _dictionary(self, service: str, account: str, *, return_data: bool = False, value: str | None = None, include_accessible: bool = False):
        refs: list[ctypes.c_void_p] = []
        dictionary = ctypes.c_void_p(self.cf.CFDictionaryCreateMutable(None, 0, None, None))
        if not dictionary.value:
            raise KeychainError("Could not create Keychain query.")
        refs.append(dictionary)
        service_ref = self._string(service)
        account_ref = self._string(account)
        refs.extend([service_ref, account_ref])
        self.cf.CFDictionarySetValue(dictionary, self.kSecClass, self.kSecClassGenericPassword)
        self.cf.CFDictionarySetValue(dictionary, self.kSecAttrService, service_ref)
        self.cf.CFDictionarySetValue(dictionary, self.kSecAttrAccount, account_ref)
        self.cf.CFDictionarySetValue(dictionary, self.kSecUseDataProtectionKeychain, self.kCFBooleanTrue)
        if return_data:
            self.cf.CFDictionarySetValue(dictionary, self.kSecReturnData, self.kCFBooleanTrue)
            self.cf.CFDictionarySetValue(dictionary, self.kSecMatchLimit, self.kSecMatchLimitOne)
        if value is not None:
            data_ref = self._data(value)
            refs.append(data_ref)
            self.cf.CFDictionarySetValue(dictionary, self.kSecValueData, data_ref)
        if include_accessible:
            self.cf.CFDictionarySetValue(
                dictionary,
                self.kSecAttrAccessible,
                self.kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            )
        return dictionary, refs

    def _release_all(self, refs) -> None:
        for ref in reversed(refs):
            try:
                if ref and ref.value:
                    self.cf.CFRelease(ref)
            except Exception:
                pass

    def get(self, service: str, account: str) -> str:
        query, refs = self._dictionary(service, account, return_data=True)
        result = ctypes.c_void_p()
        try:
            status = int(self.security.SecItemCopyMatching(query, ctypes.byref(result)))
            if status == self.ERR_SEC_ITEM_NOT_FOUND:
                return ""
            if status != self.ERR_SEC_SUCCESS or not result.value:
                raise KeychainError(f"macOS Keychain read failed (status {status}).")
            length = int(self.cf.CFDataGetLength(result))
            pointer = self.cf.CFDataGetBytePtr(result)
            if length <= 0 or not pointer:
                return ""
            return bytes(pointer[:length]).decode("utf-8")
        finally:
            if result.value:
                self.cf.CFRelease(result)
            self._release_all(refs)

    def set(self, service: str, account: str, value: str) -> None:
        normalized = str(value)
        if not normalized:
            raise KeychainError("Refusing to store an empty Keychain value.")
        query, query_refs = self._dictionary(service, account)
        # SecItemUpdate expects only attributes-to-change, not class/service/account.
        attributes = ctypes.c_void_p(self.cf.CFDictionaryCreateMutable(None, 0, None, None))
        attr_refs = [attributes]
        data_ref = self._data(normalized)
        attr_refs.append(data_ref)
        self.cf.CFDictionarySetValue(attributes, self.kSecValueData, data_ref)
        self.cf.CFDictionarySetValue(
            attributes,
            self.kSecAttrAccessible,
            self.kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        )
        try:
            status = int(self.security.SecItemUpdate(query, attributes))
            if status == self.ERR_SEC_SUCCESS:
                return
            if status != self.ERR_SEC_ITEM_NOT_FOUND:
                raise KeychainError(f"macOS Keychain update failed (status {status}).")
            add, add_refs = self._dictionary(
                service,
                account,
                value=normalized,
                include_accessible=True,
            )
            try:
                add_status = int(self.security.SecItemAdd(add, None))
                if add_status != self.ERR_SEC_SUCCESS:
                    raise KeychainError(f"macOS Keychain save failed (status {add_status}).")
            finally:
                self._release_all(add_refs)
        finally:
            self._release_all(attr_refs)
            self._release_all(query_refs)

    def delete(self, service: str, account: str) -> None:
        query, refs = self._dictionary(service, account)
        try:
            status = int(self.security.SecItemDelete(query))
            if status in {self.ERR_SEC_SUCCESS, self.ERR_SEC_ITEM_NOT_FOUND}:
                return
            raise KeychainError(f"macOS Keychain delete failed (status {status}).")
        finally:
            self._release_all(refs)
