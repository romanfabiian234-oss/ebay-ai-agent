# 8.23.24 — repair zero-photo regression

The 8.23.23 photoSection search stopped at SECTION/FIELDSET tags or internal headings, even if that container held only a header and the actual uploader was a sibling. This could return zero photos and block every destination.

The collector now expands according to actual gallery image evidence. It scans from the photo heading through the gallery, stopping before the next listing field, and handles plain text photo headings. It does not stop merely because an ancestor is SECTION or FORM. All-photo and selected-photo transfer, live label refresh, and ChatGPT support are retained.

Validation: simulated DOM tests reproduce zero photos with 8.23.23 and seven with the fix in four layouts (header-only section, internal heading, plain label, form-level siblings). Existing seven-photo drag payload, selection, missing-photo, stale-resource, and automatic-label tests pass. ChatGPT controls tests, static transfer regression, and JavaScript syntax checks pass. Tests are local fixtures; the actual authenticated eBay page was not available for verification.

Install: replace the CONTENTS of your existing installed Extension directory with this archive’s Extension contents. Reload at chrome://extensions, confirm version 8.23.24, and refresh both source and destination tabs.
