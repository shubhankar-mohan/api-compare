# Testing Prompt for DiffChecker Application

## Project Overview
DiffChecker is a privacy-first offline comparison tool for API responses and text content. All processing happens locally in the browser.

## Test Coverage Summary
- **Total Test Cases**: 109+ named test cases
- **Additional Edge Cases**: 50+ special input combinations
- **Categories Covered**: 45 major testing areas
- **Testing Types**: Functional, Performance, Security, Accessibility, Compatibility, Stress, Integration
- **Platforms**: Desktop, Mobile, PWA
- **Browsers**: Chrome, Firefox, Safari, Edge

## Testing Instructions

Please perform comprehensive testing of the DiffChecker application and report any issues found. The application should be running at http://localhost:8080/

## Priority Testing Areas

### Critical (Must Test)
1. Basic text comparison (TC1-TC4)
2. Merge conflict resolution (TC5-TC9)
3. Inline diff highlighting (TC13-TC14)
4. Copy/paste functionality (TC17)
5. Security tests (TC36-TC38)

### High Priority
1. JSON formatting and comparison (TC2, TC26-TC29)
2. Real-time diff (TC3)
3. Keyboard shortcuts (TC7, TC42)
4. Large file performance (TC20, TC33)
5. Theme persistence (TC15, TC70)

### Medium Priority
1. Text transformation tools (TC4)
2. cURL parsing (TC10-TC12, TC30-TC32)
3. Browser compatibility (TC65-TC67)
4. Mobile responsiveness (TC16, TC59-TC60)
5. Memory management (TC72-TC73)

### Low Priority
1. PWA features (TC80-TC81)
2. Export/Import (TC82-TC83)
3. Advanced search (TC84-TC85)
4. Collaboration features (TC86-TC87)
5. Analytics tracking (TC106-TC107)

## Core Features to Test

### 1. Text Compare Mode
**Test Cases:**

#### TC1: Basic Text Comparison
- [ ] Enter "bn" in Text A
- [ ] Enter "m" in Text B  
- [ ] Click "Compare Texts"
- [ ] **Expected:** Line 1 shows as completely different (red "bn" on left, green "m" on right)
- [ ] **Expected:** Toast notification should show "2 differences found" (NOT "Texts are identical")
- [ ] **Expected:** Line numbers shown as "1" for both sides

#### TC2: JSON Comparison
- [ ] Enter valid JSON in both text areas:
  ```json
  // Text A
  {
    "name": "John",
    "age": 30,
    "city": "New York"
  }
  
  // Text B
  {
    "name": "John",
    "age": 31,
    "city": "Boston"
  }
  ```
- [ ] Click "Format" button for both sides
- [ ] Verify JSON is properly formatted
- [ ] Click "Compare Texts"
- [ ] **Expected:** Line with "age" has yellow background, only "30" highlighted red on left, "31" green on right
- [ ] **Expected:** Line with "city" has yellow background, only "New York" red on left, "Boston" green on right
- [ ] **Expected:** Toast shows "2 differences found" NOT "Texts are identical"

#### TC3: Real-time Diff Toggle
- [ ] Enable "Real-time diff" toggle
- [ ] Type text in Text A and Text B
- [ ] Verify diff updates automatically without clicking "Compare"
- [ ] Disable toggle and verify it stops auto-updating

#### TC4: Text Tools
- [ ] Enter mixed case text in both fields
- [ ] Test "To lowercase" tool - verify text converts to lowercase
- [ ] Test "Sort lines" tool - verify lines are alphabetically sorted
- [ ] Test "Replace line breaks" tool - verify newlines become spaces
- [ ] Test "Trim whitespace" tool - verify leading/trailing spaces removed
- [ ] Test "Clear all" - verify both text areas are cleared

### 2. Merge Conflict Resolution
**Test Cases:**

#### TC5: Merge Mode Activation
- [ ] Compare two different texts with differences
- [ ] Click "Merge Mode" button when differences are found
- [ ] Verify merge dialog opens with side-by-side view

#### TC6: Individual Line Merging
- [ ] In merge dialog, test clicking left arrow (←) to accept left version
- [ ] Test clicking right arrow (→) to accept right version
- [ ] Test clicking double arrow (↔) to accept both versions
- [ ] Verify visual feedback (green highlight) for selected choices
- [ ] Verify progress indicator updates (e.g., "2/5 resolved")

#### TC7: Keyboard Shortcuts in Merge
- [ ] Click on a conflict line to select it
- [ ] Press ← arrow key to accept left
- [ ] Press → arrow key to accept right
- [ ] Press Enter to accept both
- [ ] Press ↑↓ arrows to navigate between conflicts
- [ ] Verify selections are applied correctly

#### TC8: Bulk Merge Actions
- [ ] Click "All Left" button
- [ ] Verify all conflicts resolved with left version
- [ ] Reset and click "All Right" button
- [ ] Verify all conflicts resolved with right version

#### TC9: Merge Result Actions
- [ ] After resolving conflicts, click "Show Merged Result"
- [ ] Verify merged text preview appears
- [ ] Click "Copy Result" - verify clipboard contains merged text
- [ ] Click "Download" - verify file downloads with merged content

### 3. API Compare Mode (cURL Diff)
**Test Cases:**

#### TC10: Basic cURL Comparison
- [ ] Switch to "API Compare" tab
- [ ] Enter a valid cURL command:
  ```bash
  curl 'https://api.github.com/users/octocat'
  ```
- [ ] Enter localhost URL: `http://localhost:3000/users/octocat`
- [ ] Click "Compare Responses" (Note: will fail without actual endpoints, but UI should handle gracefully)

#### TC11: cURL with Headers
- [ ] Enter cURL with headers:
  ```bash
  curl 'https://api.example.com/data' \
    -H 'Authorization: Bearer token' \
    -H 'Content-Type: application/json'
  ```
- [ ] Verify headers are parsed and displayed

#### TC12: cURL with POST Data
- [ ] Enter POST cURL:
  ```bash
  curl -X POST 'https://api.example.com/users' \
    -H 'Content-Type: application/json' \
    -d '{"name": "Test User", "email": "test@example.com"}'
  ```
- [ ] Verify method and body are parsed correctly

### 4. Inline Diff Highlighting
**Test Cases:**

#### TC13: Character-level Diff
- [ ] Compare two similar lines with minor differences:
  ```
  Text A: "userName: 'john_doe'"
  Text B: "userName: 'jane_doe'"
  ```
- [ ] **Expected:** Line has yellow/amber background indicating modification
- [ ] **Expected:** Only "john" is highlighted with red background on left side
- [ ] **Expected:** Only "jane" is highlighted with green background on right side
- [ ] **Expected:** "userName: '" and "_doe'" remain unhighlighted on yellow background
- [ ] **Expected:** Toast notification shows "1 difference found"

#### TC14: Modified Line Detection
- [ ] Compare JSON with partially changed values:
  ```json
  // Text A
  {"seller": "seller_123", "price": 100}
  
  // Text B
  {"seller": "seller_456", "price": 100}
  ```
- [ ] **Expected:** Entire line has yellow/amber background (modified line)
- [ ] **Expected:** Only "123" highlighted red on left side
- [ ] **Expected:** Only "456" highlighted green on right side
- [ ] **Expected:** Rest of line text remains on yellow background without additional highlighting
- [ ] **Expected:** Toast shows "1 difference found"

### 5. Visual and UI Elements
**Test Cases:**

#### TC15: Theme Toggle
- [ ] Click theme toggle button
- [ ] Verify switches between light and dark mode
- [ ] Verify all diff colors are visible in both themes

#### TC16: Responsive Design
- [ ] Resize browser window to mobile size
- [ ] Verify tools sidebar becomes hidden
- [ ] Verify mobile tools button appears (Settings icon)
- [ ] Click mobile tools button and verify dropdown menu

#### TC17: Copy Functions
- [ ] Test "Copy" button for Text A
- [ ] Test "Copy" button for Text B
- [ ] Test "Copy Merged Result" in merge view
- [ ] Verify all copy to clipboard successfully

#### TC18: Ad Placements
- [ ] Verify ad spaces are visible in right sidebar (desktop only)
- [ ] Verify bottom banner ad space
- [ ] Verify ads don't overlap with content

### 6. Edge Cases
**Test Cases:**

#### TC19: Empty Input Handling
- [ ] Click "Compare" with both fields empty
- [ ] Click "Compare" with one field empty
- [ ] Verify appropriate error messages or handling

#### TC20: Large Text Performance
- [ ] Paste very long text (1000+ lines) in both fields
- [ ] Compare and verify performance is acceptable
- [ ] Test merge mode with many conflicts

#### TC21: Special Characters
- [ ] Test with special characters, emojis, Unicode
- [ ] Test with different line endings (Windows \r\n vs Unix \n)
- [ ] Verify correct handling and display

### 7. Advanced Merge Scenarios
**Test Cases:**

#### TC22: Conflicting Multi-line Changes
- [ ] Create multi-line changes in both texts
- [ ] Test accepting mixed choices (some left, some right, some both)
- [ ] Verify merged result maintains proper line order

#### TC23: Merge with Empty Lines
- [ ] Compare text where one side has empty lines
- [ ] Test merge behavior with blank line conflicts
- [ ] Verify empty lines are handled correctly in merge

#### TC24: Cascading Merge Decisions
- [ ] Make a merge decision that affects context of next line
- [ ] Change decision and verify update cascades properly
- [ ] Test undo/redo of merge decisions (if available)

#### TC25: Merge with Identical Changes
- [ ] Add same line in different positions in both texts
- [ ] Verify merge handles duplicate content appropriately
- [ ] Test accepting both and verify no unwanted duplicates

### 8. Complex JSON Scenarios
**Test Cases:**

#### TC26: Nested JSON Comparison
- [ ] Compare deeply nested JSON (5+ levels)
- [ ] Test with arrays of objects
- [ ] Verify indentation preserved in diff view

#### TC27: JSON Array Reordering
- [ ] Compare JSON with reordered array elements
- [ ] Test merge with array index changes
- [ ] Verify array element mapping in diff

#### TC28: JSON with Special Values
- [ ] Test with null, undefined, empty strings
- [ ] Compare numbers with different precision
- [ ] Test boolean value changes
- [ ] Handle JSON with dates and timestamps

#### TC29: Malformed JSON Recovery
- [ ] Enter slightly malformed JSON (missing comma, quote)
- [ ] Test Format button error handling
- [ ] Verify graceful error messages
- [ ] Test comparison with one valid and one invalid JSON

### 9. cURL Advanced Testing
**Test Cases:**

#### TC30: Complex cURL Parsing
- [ ] Test cURL with multiple data flags (-d used multiple times)
- [ ] Test with form data (--data-urlencode)
- [ ] Test with file upload references (@filename)
- [ ] Test with cookie headers

#### TC31: cURL Method Variations
- [ ] Test PUT, DELETE, PATCH, OPTIONS methods
- [ ] Test custom methods (-X CUSTOM)
- [ ] Test method override scenarios

#### TC32: cURL with Authentication
- [ ] Test Basic Auth (--user username:password)
- [ ] Test Bearer token in different formats
- [ ] Test API key in headers vs query params
- [ ] Test certificate-based auth references

### 10. Performance Stress Tests
**Test Cases:**

#### TC33: Large File Comparison
- [ ] Compare 10,000+ line files
- [ ] Test merge with 1000+ conflicts
- [ ] Verify no browser freeze or crash
- [ ] Check memory usage doesn't exceed limits

#### TC34: Rapid Operations
- [ ] Rapidly switch between Text and API compare tabs
- [ ] Quickly toggle real-time diff on/off while typing
- [ ] Spam click merge decision buttons
- [ ] Test multiple dialogs opening/closing quickly

#### TC35: Concurrent Comparisons
- [ ] Start comparison, quickly change text and compare again
- [ ] Open merge dialog while comparison is running
- [ ] Test with multiple browser tabs open

### 11. Security Testing
**Test Cases:**

#### TC36: XSS Prevention
- [ ] Enter `<script>alert('XSS')</script>` in text fields
- [ ] Test HTML injection in JSON values
- [ ] Verify no script execution in diff view
- [ ] Test with onclick and onerror attributes

#### TC37: Input Sanitization
- [ ] Test with SQL injection patterns
- [ ] Enter very long strings (100,000+ characters)
- [ ] Test with null bytes and control characters
- [ ] Verify no code execution from user input

#### TC38: Data Privacy
- [ ] Verify no data sent to external servers
- [ ] Check browser network tab during operations
- [ ] Test with sensitive data patterns (SSN, credit cards)
- [ ] Confirm local storage only stores preferences

### 12. Browser Storage Tests
**Test Cases:**

#### TC39: Local Storage Persistence
- [ ] Set theme preference, refresh page
- [ ] Make merge decisions, refresh, verify lost
- [ ] Test storage quota limits
- [ ] Clear browser data and verify graceful handling

#### TC40: Session Management
- [ ] Test with multiple browser tabs
- [ ] Verify independent state per tab
- [ ] Test browser back/forward navigation
- [ ] Check for memory leaks over time

### 13. Accessibility Deep Dive
**Test Cases:**

#### TC41: Screen Reader Testing
- [ ] Navigate entire app with screen reader
- [ ] Verify all buttons have aria-labels
- [ ] Test merge conflict announcements
- [ ] Verify diff changes are announced

#### TC42: Keyboard-Only Navigation
- [ ] Complete full workflow without mouse
- [ ] Test Tab order is logical
- [ ] Verify focus traps in dialogs
- [ ] Test Escape key closes dialogs

#### TC43: High Contrast Mode
- [ ] Enable OS high contrast mode
- [ ] Verify diff colors still distinguishable
- [ ] Check button boundaries visible
- [ ] Test with color blindness simulators

### 14. Error Recovery
**Test Cases:**

#### TC44: Network Failure Handling (API Compare)
- [ ] Disconnect network during API comparison
- [ ] Test timeout scenarios
- [ ] Verify error messages are helpful
- [ ] Test retry mechanisms

#### TC45: Invalid Input Recovery
- [ ] Test with binary data pasted
- [ ] Enter invalid URLs in API compare
- [ ] Test with corrupted clipboard data
- [ ] Verify no permanent UI breaks

### 15. Cross-Format Comparisons
**Test Cases:**

#### TC46: JSON vs Non-JSON
- [ ] Compare JSON in one field, plain text in other
- [ ] Test format button with mixed content
- [ ] Verify merge handles format mismatch

#### TC47: XML Comparison
- [ ] Test with XML content (even though JSON-focused)
- [ ] Compare XML with different attribute orders
- [ ] Test with CDATA sections

#### TC48: Markdown Content
- [ ] Compare markdown documents
- [ ] Test with code blocks in markdown
- [ ] Verify special markdown characters handled

### 16. Internationalization
**Test Cases:**

#### TC49: Multi-language Support
- [ ] Test with Chinese, Japanese, Korean text
- [ ] Test with Arabic/Hebrew (RTL text)
- [ ] Compare texts in different languages
- [ ] Test emoji and special symbols

#### TC50: Encoding Issues
- [ ] Test UTF-8, UTF-16 content
- [ ] Mix different encodings
- [ ] Test with BOM markers
- [ ] Verify no mojibake (garbled text)

### 17. UI State Management
**Test Cases:**

#### TC51: State Consistency
- [ ] Make changes, switch tabs, return - verify state
- [ ] Test with browser zoom (50% to 200%)
- [ ] Verify responsive breakpoints
- [ ] Test print preview/functionality

#### TC52: Dialog State
- [ ] Open merge dialog, press browser back
- [ ] Test dialog with very long content
- [ ] Verify scroll position maintained
- [ ] Test nested dialog scenarios

### 18. Integration Scenarios
**Test Cases:**

#### TC53: Copy-Paste Workflows
- [ ] Copy from Excel, paste and compare
- [ ] Copy from IDE with syntax highlighting
- [ ] Test with formatted rich text
- [ ] Verify paste preserves line breaks

#### TC54: File Import (Future Feature Test)
- [ ] Drag and drop text files (if supported)
- [ ] Test with different file encodings
- [ ] Verify large file handling
- [ ] Test unsupported file types

### 19. Boundary Testing
**Test Cases:**

#### TC55: Minimum Input
- [ ] Single character comparison
- [ ] Empty vs single character
- [ ] Single line vs multi-line
- [ ] One word difference

#### TC56: Maximum Input
- [ ] Maximum URL length in cURL
- [ ] Maximum header size
- [ ] Maximum JSON nesting depth
- [ ] Browser's maximum string length

### 20. Time-based Testing
**Test Cases:**

#### TC57: Long Session Testing
- [ ] Leave app open for 1+ hours
- [ ] Perform operations after idle time
- [ ] Test auto-save functionality (if any)
- [ ] Verify no session timeouts

#### TC58: Rapid Sequential Operations
- [ ] Compare → Merge → Copy within 2 seconds
- [ ] Switch modes rapidly
- [ ] Toggle settings while comparing
- [ ] Test UI responsiveness under load

### 21. Mobile-Specific Tests
**Test Cases:**

#### TC59: Touch Interactions
- [ ] Test pinch-to-zoom in diff view
- [ ] Swipe gestures for navigation
- [ ] Long-press for context menus
- [ ] Test with device rotation

#### TC60: Mobile Performance
- [ ] Test on low-end devices
- [ ] Verify battery usage is reasonable
- [ ] Test with limited RAM
- [ ] Check cellular data usage

### 22. Advanced Diff Algorithm Tests
**Test Cases:**

#### TC61: Algorithm Edge Cases
- [ ] Compare files with only whitespace changes
- [ ] Test with only indentation differences
- [ ] Compare with only case differences
- [ ] Test line ending changes only

#### TC62: Similarity Detection
- [ ] Test with 90% similar lines
- [ ] Verify character-level diff triggers correctly
- [ ] Test threshold boundaries
- [ ] Compare performance with/without similarity

### 23. Merge Conflict Edge Cases
**Test Cases:**

#### TC63: Complex Merge Patterns
- [ ] Create circular dependency in merge choices
- [ ] Test with 100+ conflicts
- [ ] Alternating pattern (left-right-left-right)
- [ ] All conflicts choosing "both"

#### TC64: Merge Result Validation
- [ ] Verify JSON validity after merge
- [ ] Check no data loss in merge
- [ ] Test merge with special characters
- [ ] Validate line ending consistency

### 24. Browser-Specific Tests
**Test Cases:**

#### TC65: Safari-Specific
- [ ] Test clipboard API permissions
- [ ] Verify smooth scrolling
- [ ] Test with Safari Reader mode
- [ ] Check PWA functionality

#### TC66: Firefox-Specific
- [ ] Test with strict privacy mode
- [ ] Verify with resist fingerprinting
- [ ] Test container tabs
- [ ] Check memory usage

#### TC67: Chrome-Specific
- [ ] Test with experimental features
- [ ] Verify with DevTools open
- [ ] Test incognito mode
- [ ] Check extension interactions

### 25. Regression Tests
**Test Cases:**

#### TC68: Previously Fixed Bugs
- [ ] Merge button visibility in middle
- [ ] Inline diff only highlighting changes
- [ ] Dialog syntax errors
- [ ] Fragment wrapper issues

#### TC69: Version Compatibility
- [ ] Test after browser updates
- [ ] Verify after dependency updates
- [ ] Test with old browser versions
- [ ] Check polyfill functionality

## Expected Behaviors

### Diff Visualization
- **Unchanged lines**: Normal text, no background
- **Added lines**: Green background with + icon
- **Removed lines**: Red background with - icon  
- **Modified lines**: Yellow background with inline character highlighting
- **Empty lines**: Gray background

### Merge Controls
- **Unresolved conflicts**: Show merge buttons in middle
- **Resolved conflicts**: Show green background on selected side
- **Selected line**: Blue ring border for keyboard navigation
- **Progress**: "X/Y resolved" counter updates in real-time

## Bug Report Template

When reporting issues, please include:

```markdown
### Issue Description
[Clear description of the problem]

### Steps to Reproduce
1. [First step]
2. [Second step]
3. [etc...]

### Expected Behavior
[What should happen]

### Actual Behavior
[What actually happens]

### Screenshots
[If applicable]

### Environment
- Browser: [Chrome/Firefox/Safari/Edge]
- OS: [Windows/Mac/Linux]
- Screen Size: [Desktop/Tablet/Mobile]

### Severity
[Critical/High/Medium/Low]
```

### 26. Color Scheme & Theme Testing
**Test Cases:**

#### TC70: Theme Persistence
- [ ] Switch theme, close browser, reopen
- [ ] Test theme in private/incognito mode
- [ ] Verify theme syncs across tabs
- [ ] Test with system theme changes

#### TC71: Color Accessibility
- [ ] Test with deuteranopia (red-green blindness)
- [ ] Test with protanopia (red blindness)
- [ ] Test with tritanopia (blue-yellow blindness)
- [ ] Verify sufficient contrast ratios (WCAG AA)

### 27. Memory Management Tests
**Test Cases:**

#### TC72: Memory Leak Detection
- [ ] Compare 100 times in succession
- [ ] Open/close merge dialog 50 times
- [ ] Monitor memory in Chrome DevTools
- [ ] Test garbage collection triggers

#### TC73: DOM Node Management
- [ ] Check DOM node count doesn't grow infinitely
- [ ] Verify event listeners are cleaned up
- [ ] Test with Chrome Memory Profiler
- [ ] Monitor detached DOM trees

### 28. Line Number Edge Cases
**Test Cases:**

#### TC74: Line Number Accuracy
- [ ] Compare files with 9999 to 10000 lines (digit change)
- [ ] Test with mixed line endings affecting count
- [ ] Verify line numbers in merge view match
- [ ] Test line number alignment with very long lines

#### TC75: Line Number Navigation
- [ ] Click line numbers (if clickable)
- [ ] Test line number search/jump (if available)
- [ ] Verify line numbers in copied text
- [ ] Test line number display on mobile

### 29. Syntax Highlighting Tests
**Test Cases:**

#### TC76: JSON Syntax Highlighting
- [ ] Test with complex nested structures
- [ ] Verify color coding for keys vs values
- [ ] Test with very long string values
- [ ] Check number/boolean/null highlighting

#### TC77: Code in Text
- [ ] Paste programming code and compare
- [ ] Test with mixed code and comments
- [ ] Verify no false syntax detection
- [ ] Test with minified code

### 30. Multi-Window Scenarios
**Test Cases:**

#### TC78: Cross-Window Operations
- [ ] Open app in two windows, test independence
- [ ] Copy from one window, paste in another
- [ ] Test theme sync across windows
- [ ] Verify no shared state issues

#### TC79: Window Resize Handling
- [ ] Resize window during comparison
- [ ] Test from fullscreen to minimal size
- [ ] Verify layout doesn't break
- [ ] Test responsive transitions

### 31. PWA Features (if applicable)
**Test Cases:**

#### TC80: PWA Installation
- [ ] Test "Add to Home Screen" functionality
- [ ] Verify app works offline after installation
- [ ] Test standalone window mode
- [ ] Check icon and splash screen

#### TC81: Offline Functionality
- [ ] Load app, go offline, test all features
- [ ] Test with intermittent connection
- [ ] Verify cached resources load
- [ ] Test service worker updates

### 32. Data Export/Import
**Test Cases:**

#### TC82: Export Functionality
- [ ] Export comparison results
- [ ] Export merge decisions
- [ ] Test different export formats
- [ ] Verify exported data integrity

#### TC83: Import Functionality
- [ ] Import previously exported data
- [ ] Test with corrupted import files
- [ ] Verify import validation
- [ ] Test large import files

### 33. Search Within Diff
**Test Cases:**

#### TC84: Search Functionality
- [ ] Search for text in diff view
- [ ] Test case-sensitive search
- [ ] Search with regex patterns
- [ ] Verify search highlighting

#### TC85: Search Navigation
- [ ] Navigate between search results
- [ ] Test wraparound at end of results
- [ ] Verify result count accuracy
- [ ] Test search in merged result

### 34. Collaborative Features
**Test Cases:**

#### TC86: Share Functionality
- [ ] Test sharing comparison via link
- [ ] Verify shared data privacy
- [ ] Test link expiration (if applicable)
- [ ] Check share permissions

#### TC87: Collaboration Scenarios
- [ ] Multiple users viewing same comparison
- [ ] Test real-time updates (if supported)
- [ ] Verify conflict resolution
- [ ] Test user identification

### 35. Undo/Redo Functionality
**Test Cases:**

#### TC88: Undo Operations
- [ ] Undo text input
- [ ] Undo merge decisions
- [ ] Undo format operations
- [ ] Test undo stack limit

#### TC89: Redo Operations
- [ ] Redo after undo
- [ ] Test redo stack clearing
- [ ] Verify state consistency
- [ ] Test keyboard shortcuts (Ctrl+Z/Y)

### 36. Filter and Sort Options
**Test Cases:**

#### TC90: Diff Filtering
- [ ] Show only additions
- [ ] Show only deletions
- [ ] Show only modifications
- [ ] Filter by line content

#### TC91: Sort Options
- [ ] Sort diff by type of change
- [ ] Sort by line number
- [ ] Sort by similarity score
- [ ] Test custom sort orders

### 37. API Rate Limiting
**Test Cases:**

#### TC92: Rate Limit Handling
- [ ] Test rapid API comparisons
- [ ] Verify rate limit error messages
- [ ] Test retry logic
- [ ] Check backoff strategies

#### TC93: Quota Management
- [ ] Test with API quotas
- [ ] Verify quota warnings
- [ ] Test quota reset handling
- [ ] Check usage tracking

### 38. Comparison History
**Test Cases:**

#### TC94: History Management
- [ ] View previous comparisons
- [ ] Test history limit
- [ ] Clear history functionality
- [ ] Test history persistence

#### TC95: History Navigation
- [ ] Navigate to previous comparison
- [ ] Test history search
- [ ] Verify timestamp accuracy
- [ ] Test history export

### 39. Advanced Text Processing
**Test Cases:**

#### TC96: Text Normalization
- [ ] Test Unicode normalization
- [ ] Handle zero-width characters
- [ ] Test with ligatures
- [ ] Verify combining characters

#### TC97: Text Transformation
- [ ] Test base64 encoding/decoding
- [ ] URL encoding/decoding
- [ ] HTML entity conversion
- [ ] Test escape sequences

### 40. Performance Metrics
**Test Cases:**

#### TC98: Timing Measurements
- [ ] Measure diff computation time
- [ ] Test render performance
- [ ] Measure memory allocation
- [ ] Check frame rate during scroll

#### TC99: Resource Loading
- [ ] Test lazy loading of components
- [ ] Verify code splitting works
- [ ] Test CDN fallbacks
- [ ] Monitor network requests

### 41. Error Boundary Testing
**Test Cases:**

#### TC100: Component Crash Recovery
- [ ] Force component errors
- [ ] Verify error boundaries catch crashes
- [ ] Test error reporting
- [ ] Verify graceful degradation

#### TC101: Recursive Error Prevention
- [ ] Test error in error handler
- [ ] Verify no infinite loops
- [ ] Test stack overflow prevention
- [ ] Check maximum call stack

### 42. Browser API Compatibility
**Test Cases:**

#### TC102: Clipboard API
- [ ] Test fallback for older browsers
- [ ] Verify permissions handling
- [ ] Test with clipboard blocked
- [ ] Check async clipboard API

#### TC103: Storage APIs
- [ ] Test localStorage fallback
- [ ] Verify IndexedDB usage
- [ ] Test storage quota exceeded
- [ ] Check cookie fallbacks

### 43. Content Security Policy
**Test Cases:**

#### TC104: CSP Compliance
- [ ] Test with strict CSP headers
- [ ] Verify no inline scripts
- [ ] Test with nonce/hash validation
- [ ] Check for CSP violations

#### TC105: CORS Handling
- [ ] Test cross-origin requests
- [ ] Verify CORS error handling
- [ ] Test with proxy setup
- [ ] Check preflight requests

### 44. Logging and Analytics
**Test Cases:**

#### TC106: Event Tracking
- [ ] Verify analytics events fire
- [ ] Test error logging
- [ ] Check performance metrics logging
- [ ] Test user action tracking

#### TC107: Debug Mode
- [ ] Enable debug logging
- [ ] Verify verbose output
- [ ] Test log levels
- [ ] Check log persistence

### 45. Migration Testing
**Test Cases:**

#### TC108: Version Migration
- [ ] Test upgrade from old version
- [ ] Verify data migration
- [ ] Test backwards compatibility
- [ ] Check deprecation warnings

#### TC109: Browser Migration
- [ ] Import data from other tools
- [ ] Test export to competitor formats
- [ ] Verify no data loss
- [ ] Test partial migration

## Exhaustive Edge Cases

### Special Input Combinations
- [ ] Null vs undefined comparison
- [ ] Empty string vs whitespace
- [ ] Zero vs negative zero
- [ ] Infinity and NaN values
- [ ] Circular reference detection
- [ ] Symbolic links in text
- [ ] Binary data in text fields
- [ ] Mixed emoji skin tones
- [ ] Surrogate pairs in Unicode
- [ ] Right-to-left override characters
- [ ] Invisible characters (zero-width joiner)
- [ ] Control characters in input
- [ ] Maximum integer values
- [ ] Floating point precision limits
- [ ] Date timezone edge cases
- [ ] Daylight saving time boundaries
- [ ] Leap year/second handling
- [ ] Y2K38 problem dates
- [ ] Regex special characters
- [ ] SQL keywords in text
- [ ] HTML entities in plain text
- [ ] Markdown in JSON values
- [ ] GraphQL queries as text
- [ ] Binary operators in strings
- [ ] File path separators (/ vs \)
- [ ] URL fragments and anchors
- [ ] Punycode domain names
- [ ] IPv6 addresses in URLs
- [ ] Port number edge cases
- [ ] Localhost variations (127.0.0.1, ::1)
- [ ] Case-sensitive file systems
- [ ] Reserved Windows filenames
- [ ] Path traversal attempts
- [ ] Symlink recursion
- [ ] Hard link handling
- [ ] Network path formats
- [ ] Cloud storage URLs
- [ ] Data URLs in inputs
- [ ] Blob URLs handling
- [ ] Object URLs cleanup
- [ ] Protocol-relative URLs
- [ ] Magnet links
- [ ] Tel: and mailto: links
- [ ] Custom protocol handlers
- [ ] Fragment identifiers
- [ ] Query string edge cases
- [ ] Multiple question marks in URL
- [ ] Hash in hash routing
- [ ] Percent encoding edge cases

## Performance Checklist

- [ ] Page loads in under 2 seconds
- [ ] Diff computation for 100 lines takes < 1 second
- [ ] Merge dialog opens instantly
- [ ] No memory leaks after extended use
- [ ] Smooth scrolling in diff views
- [ ] No UI freezing during operations

## Accessibility Testing

- [ ] All buttons have proper labels/tooltips
- [ ] Keyboard navigation works throughout
- [ ] Color contrast is sufficient for readability
- [ ] Screen reader compatibility (if applicable)
- [ ] Focus indicators are visible

## Browser Compatibility

Test on:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile browsers (iOS Safari, Chrome Mobile)

## Known Issues to Verify Fixed

1. **Merge button visibility**: Buttons in middle of conflict lines should be clearly visible
2. **Inline diff highlighting**: Only changed portions within lines should be highlighted, not entire lines
3. **Text Compare merge**: "Merge Mode" button should appear when differences found
4. **Dialog rendering**: Merge dialog should open without syntax errors

## Test Data Sets

### Sample JSON 1 - User Data
```json
{
  "users": [
    {
      "id": 1,
      "name": "Alice Smith",
      "email": "alice@example.com",
      "roles": ["admin", "user"]
    },
    {
      "id": 2,
      "name": "Bob Johnson",
      "email": "bob@example.com",
      "roles": ["user"]
    }
  ]
}
```

### Sample JSON 2 - API Response
```json
{
  "status": "success",
  "data": {
    "items": [
      {"id": "item1", "price": 29.99, "inStock": true},
      {"id": "item2", "price": 49.99, "inStock": false}
    ],
    "total": 79.98,
    "currency": "USD"
  },
  "timestamp": "2024-01-04T12:00:00Z"
}
```

### Sample cURL Commands
```bash
# GET request
curl 'https://jsonplaceholder.typicode.com/posts/1'

# POST request
curl -X POST 'https://jsonplaceholder.typicode.com/posts' \
  -H 'Content-Type: application/json' \
  -d '{"title": "foo", "body": "bar", "userId": 1}'

# With authentication
curl 'https://api.example.com/protected' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
```

## Final Checklist

- [ ] All test cases pass
- [ ] No console errors in browser DevTools
- [ ] No network errors for legitimate requests
- [ ] UI is responsive and intuitive
- [ ] All features work as documented
- [ ] Performance is acceptable
- [ ] Cross-browser compatibility verified

## Additional Inline Diff Test Cases

### TC110: Property Order Change in JSON
- [ ] Compare these JSONs:
  ```json
  // Text A
  {"name": "John", "age": 30}
  
  // Text B
  {"age": 30, "name": "John"}
  ```
- [ ] **Expected:** Both lines marked as completely different (red on left, green on right)
- [ ] **Note:** Property reordering is treated as different lines, not modifications

### TC111: Whitespace-Only Changes
- [ ] Compare:
  ```
  Text A: "hello  world" (2 spaces)
  Text B: "hello world" (1 space)
  ```
- [ ] **Expected:** Yellow background on line
- [ ] **Expected:** The extra space highlighted in red on left
- [ ] **Expected:** Normal spacing on right

### TC112: Number Precision Changes
- [ ] Compare:
  ```json
  Text A: {"value": 10.00}
  Text B: {"value": 10.0}
  ```
- [ ] **Expected:** Yellow background
- [ ] **Expected:** "10.00" in red on left
- [ ] **Expected:** "10.0" in green on right

### TC113: Case-Only Differences
- [ ] Compare:
  ```
  Text A: "UserName"
  Text B: "username"
  ```
- [ ] **Expected:** Yellow background
- [ ] **Expected:** Entire "UserName" in red
- [ ] **Expected:** Entire "username" in green

### TC114: Punctuation Changes
- [ ] Compare:
  ```
  Text A: "Hello, world!"
  Text B: "Hello world"
  ```
- [ ] **Expected:** Yellow background
- [ ] **Expected:** "," and "!" highlighted in red on left
- [ ] **Expected:** No extra highlighting on right

### TC115: Line Break Differences
- [ ] Compare:
  ```
  Text A: "line1\nline2"
  Text B: "line1 line2"
  ```
- [ ] **Expected:** First line "line1" shown as removed (red)
- [ ] **Expected:** "line2" shown as removed (red)
- [ ] **Expected:** "line1 line2" shown as added (green)

## Comprehensive Test Report (User-Provided)

### Critical Bug Found
**Issue:** Toast notification always displays "Texts are identical" even when differences are clearly found and displayed in the diff view.

### Test Results Summary

#### ✅ Passed Tests
1. **Basic Comparison**: Diff view correctly shows differences
2. **Line Numbers**: Properly displayed for both sides
3. **Theme Toggle**: Switches between light/dark modes correctly
4. **Copy Functions**: Copy buttons work for both text areas
5. **Format JSON**: Properly formats valid JSON
6. **Clear All**: Clears both text areas
7. **Real-time Diff**: Updates automatically when enabled
8. **Merge Dialog**: Opens and displays conflicts
9. **Keyboard Navigation**: Arrow keys work in merge mode
10. **Responsive Design**: Adapts to mobile view

#### ❌ Failed Tests

1. **Toast Notification Bug**
   - **Test Case**: Any comparison with differences
   - **Expected**: "X differences found" toast message
   - **Actual**: Always shows "Texts are identical"
   - **Severity**: CRITICAL - Misleading user feedback
   - **Steps to Reproduce**:
     1. Enter different text in both fields
     2. Click "Compare Texts"
     3. Observe toast message
   - **Note**: Diff view shows correct differences, only toast is wrong

2. **Inline Diff Highlighting**
   - **Test Case**: Similar lines with minor changes
   - **Expected**: Yellow background with only changed characters highlighted
   - **Actual**: Entire lines shown as removed/added instead of modified
   - **Severity**: HIGH - Core feature not working as designed
   - **Example**:
     ```
     Input A: {"age": 30}
     Input B: {"age": 31}
     Expected: Yellow line with only "30" red and "31" green
     Actual: Entire line red on left, entire line green on right
     ```

3. **Merge Button Visibility**
   - **Test Case**: Initial merge dialog load
   - **Expected**: Merge control buttons clearly visible
   - **Actual**: Buttons sometimes don't render until interaction
   - **Severity**: MEDIUM - UI glitch

#### ⚠️ Observations

1. **Performance**: Large files (5000+ lines) cause slight lag
2. **Memory Usage**: Increases with multiple comparisons but stabilizes
3. **Browser Compatibility**: Works best in Chrome, some rendering issues in Safari
4. **Mobile Experience**: Merge buttons too small on mobile devices

### Recommended Fixes Priority

1. **URGENT**: Fix toast notification to show correct difference count
2. **HIGH**: Improve line similarity detection for inline highlighting
3. **MEDIUM**: Enhance merge button visibility and mobile sizing
4. **LOW**: Optimize performance for very large files

## Notes for Tester

- The application works entirely offline after initial load
- API Compare mode requires actual endpoints to test fully
- Merge mode is available in both Text Compare and API Compare
- Ad spaces are placeholders in development mode
- The app uses local storage for theme preference
- **Critical Issue**: Toast notification bug affects user trust - always shows "identical" even with differences

Please document any issues found using the bug report template above. Pay special attention to:
1. Toast notification accuracy
2. Inline diff highlighting behavior
3. Merge conflict resolution UI