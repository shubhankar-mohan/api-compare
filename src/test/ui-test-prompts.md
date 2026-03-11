# UI Test Prompts for DiffChecker

These prompts are designed to be used with the Claude Chrome Extension for manual UI testing.
Copy each prompt into the extension while the app is running at `http://localhost:8080`.

---

## TEST 1: Basic Page Load & Layout

```
Look at the current page. Verify:
1. The header shows "DiffChecker" logo and title with tagline "Compare Offline - Your data stays with you"
2. There are two mode tabs visible: "cURL Diff" and "Text Diff"
3. A theme toggle (light/dark) button exists in the header
4. An "Open in new tab" button exists
5. The footer contains "Virtualis World" copyright, GitHub source code link, and Report Issue link
6. The page has a clean gradient background

Report any visual issues, broken layout, or missing elements.
```

---

## TEST 2: cURL Diff Mode - Prod vs Localhost (Default)

```
Switch to "cURL Diff" mode if not already there. Verify:
1. The card title shows "cURL Diff" with a terminal icon
2. The description says "Compare production API with localhost environment"
3. There is a toggle labeled "Prod vs Localhost" on the right
4. There is a large textarea labeled "Production cURL Command"
5. Below it, there is an input field labeled "Localhost Base URL" with placeholder "http://localhost:8080"
6. A "Get and Compare Responses" button exists with keyboard shortcut hint
7. The button should be disabled (grayed out) since no input is entered

Report any visual issues or missing elements.
```

---

## TEST 3: cURL Diff Mode - Any Environment Toggle

```
In "cURL Diff" mode, click the toggle switch to change to "Any Environment" mode. Verify:
1. The description changes to "Compare API responses between any two environments"
2. The single textarea + input layout changes to TWO side-by-side textareas
3. Left textarea is labeled "cURL Command A"
4. Right textarea is labeled "cURL Command B"
5. Both textareas have copy and clear (X) buttons
6. The "Get and Compare Responses" button is disabled until both fields have content

Toggle back and verify it returns to the original layout. Report any issues.
```

---

## TEST 4: Paste cURL and Compare (Any Environment Mode)

```
Switch to "Any Environment" mode using the toggle.

In cURL Command A, paste:
curl --location 'https://api.example.com/v1/widget_products' \
--header 'content-type: application/json' \
--data '{
  "user_id": "usr_0f3c9a1b7e2d4c6a8b5f",
  "widget_name": "spring_sale_t43",
  "widget_id": 3103,
  "widget_type": 56,
  "request_source": "web::3103::default",
  "meta": { "app_version": "6.7.1" },
  "data": {
    "give_data_for_product_ids": false,
    "in_stock_only": true,
    "limit": 10,
    "offset": 0,
    "product_ids": ["4045", "4046", "4047", "4058"],
    "redirect_to_plp": true,
    "remove_navigation": false,
    "show_recommendations": false,
    "sort_by_rating": true
  }
}'

In cURL Command B, paste the same command but with URL changed to localhost:
curl --location 'http://localhost:8080/v1/widget_products' \
--header 'content-type: application/json' \
--data '{
  "user_id": "usr_0f3c9a1b7e2d4c6a8b5f",
  "widget_name": "spring_sale_t43",
  "widget_id": 3103,
  "widget_type": 56,
  "request_source": "web::3103::default",
  "meta": { "app_version": "6.7.1" },
  "data": {
    "give_data_for_product_ids": false,
    "in_stock_only": true,
    "limit": 10,
    "offset": 0,
    "product_ids": ["4045", "4046", "4047", "4058"],
    "redirect_to_plp": true,
    "remove_navigation": false,
    "show_recommendations": false,
    "sort_by_rating": true
  }
}'

Click "Get and Compare Responses". Verify:
1. The button shows a loading spinner with "Comparing..." text
2. A toast notification appears saying "Executing requests..."
3. After completion, either:
   a. A diff viewer appears showing Response Comparison (if both servers respond), OR
   b. A troubleshoot section appears (if one/both servers are unreachable)
4. The page does NOT crash or freeze
5. No white screen / blank page

Report exactly what you see after clicking Compare.
```

---

## TEST 5: Page Crash Regression (Large Response)

```
This test verifies the page doesn't crash with large API responses.

Switch to "Any Environment" mode.

In cURL Command A, paste:
curl 'https://jsonplaceholder.typicode.com/photos'

In cURL Command B, paste:
curl 'https://jsonplaceholder.typicode.com/comments'

Click "Get and Compare Responses". These are large JSON responses (500+ items each).

Verify:
1. The page does NOT crash, freeze, or go to a white/blank screen
2. A loading state appears while fetching
3. After completion, the diff viewer loads and shows results
4. You can scroll through the diff without the page becoming unresponsive
5. The "Response Body" tab shows the diff
6. The "Headers" tab is clickable and shows header differences

Report if the page crashes, freezes, or becomes unresponsive at any point.
```

---

## TEST 6: Text Diff Mode

```
Click on the "Text Diff" tab in the header. Verify:
1. The mode switches to a text comparison interface
2. There are two text areas for pasting content
3. The layout is clean and both areas are visible

Paste the following in the left/first area:
{
  "name": "John",
  "age": 30,
  "city": "New York",
  "hobbies": ["reading", "coding"]
}

Paste this in the right/second area:
{
  "name": "Jane",
  "age": 25,
  "city": "New York",
  "hobbies": ["reading", "painting", "cooking"]
}

Trigger the comparison. Verify:
1. Differences are highlighted (name, age, hobbies values)
2. Unchanged lines (city) are shown without highlighting
3. The diff is readable with clear visual distinction between added/removed/modified

Report any visual issues with the diff display.
```

---

## TEST 7: Diff Viewer Features

```
After running any successful comparison in cURL Diff mode that shows differences, verify:
1. Response Comparison card appears with a "Response Body" and "Headers" tab
2. There are two panels: "Original Domain" (left) and "Localhost" (right)
3. Line numbers are shown on the left of each panel
4. Added lines have a green background with + icon
5. Removed lines have a red background with - icon
6. Modified lines show inline word-level highlighting
7. Badge counts show number of additions (+N) and removals (-N)
8. Copy button exists on each panel header
9. If JSON: "Diff" and "Foldable" view toggle buttons are visible
10. If differences exist: "Merge" button is visible
11. A "Go to Path" button exists with a popover for JSON path navigation
12. Diff Options panel exists (gear/settings icon)
13. Search bar exists for searching within diff

Click each button and verify it responds (no crashes). Report any issues.
```

---

## TEST 8: History Feature

```
Run at least 2 different comparisons in cURL Diff mode. Then:
1. Look for a "History" button/dropdown near the top of the input section
2. Click it - a dropdown should appear showing previous commands
3. Each history item should show a timestamp and truncated command preview
4. Click a history item - it should load the command into the input fields
5. Each item should have an X button to remove it
6. There should be a "Clear all history" option at the bottom

Verify all interactions work without errors. Report any issues.
```

---

## TEST 9: Error Handling - Invalid cURL

```
In "Any Environment" mode, test error handling:

Test A - Empty fields:
1. Clear both fields and verify the Compare button is disabled

Test B - Invalid cURL in one field:
1. Type "not a curl command" in field A
2. Paste a valid curl in field B
3. Click Compare
4. Verify the app shows an appropriate error or troubleshoot section, not a crash

Test C - Malformed URL:
1. Type "curl 'not-a-url'" in field A
2. Type "curl 'also-not-a-url'" in field B
3. Click Compare
4. Verify the app handles this gracefully

Report if any test causes a crash or unhandled error.
```

---

## TEST 10: Responsive Layout

```
Test the page at different viewport sizes:

1. Desktop (1920px wide): Verify the two-panel diff view shows side by side
2. Tablet (768px wide): Verify the layout adapts, nothing overflows
3. Mobile (375px wide): Verify:
   - Header elements stack or hide appropriately
   - Input areas are usable
   - The diff view is scrollable
   - No horizontal overflow causing a scrollbar

Report any layout breaking, overlapping elements, or unusable UI at any size.
```

---

## TEST 11: Theme Toggle

```
1. Click the theme toggle button in the header
2. Verify the entire page switches between light and dark mode
3. In dark mode verify:
   - Background is dark
   - Text is light/readable
   - Diff highlighting (green/red) is visible against dark background
   - Input fields have appropriate dark styling
   - Cards and borders are visible
4. Toggle back to light mode and verify everything returns to normal
5. Refresh the page and verify the theme preference is remembered

Report any elements that don't properly adapt to the theme.
```

---

## TEST 12: Keyboard Shortcuts

```
1. Enter a valid cURL in the input field
2. Press Cmd+Enter (Mac) or Ctrl+Enter (Windows) - verify it triggers comparison
3. After a comparison with search results, press Cmd+N / Ctrl+N to navigate to next search result
4. Press Cmd+P / Ctrl+P to navigate to previous search result

Report if any keyboard shortcuts don't work or cause unexpected behavior.
```

---

## TEST 13: Copy Functionality

```
1. Run a successful comparison
2. Click the Copy button on the "Original Domain" panel header
3. Verify a toast notification says "Copied!"
4. Paste somewhere to verify the full response body was copied
5. Click the Copy button on the "Localhost" panel header
6. Verify that also copies correctly
7. In the input section, click the Copy button next to "cURL Command A"
8. Verify the curl command is copied

Report any copy failures or incorrect content.
```

---

## TEST 14: Troubleshoot Section

```
In "Any Environment" mode, paste:

cURL Command A:
curl 'http://localhost:99999/nonexistent'

cURL Command B:
curl 'http://localhost:99998/nonexistent'

Click Compare. Both should fail. Verify:
1. A troubleshoot section appears (not the diff viewer)
2. Error messages are shown for both requests
3. The error messages are helpful (mention connection issues, CORS, etc.)
4. No page crash

Report what the troubleshoot section shows.
```

---

## TEST 15: Prod vs Localhost Mode URL Construction

```
Switch to "Prod vs Localhost" mode (toggle off "Any Environment").

In Production cURL Command, paste:
curl 'https://api.example.com/v2/users/123?include=profile' \
-H 'Authorization: Bearer token123' \
-H 'Content-Type: application/json'

Leave Localhost Base URL as default (http://localhost:8080).

Click Compare. Verify:
1. The app constructs the localhost URL as: http://localhost:8080/v2/users/123?include=profile
2. Headers from the production curl are applied to both requests
3. The request is sent (may fail, but the URL construction should be correct)
4. Check the error/response to confirm the localhost URL was built correctly

Report what URLs were actually called.
```
