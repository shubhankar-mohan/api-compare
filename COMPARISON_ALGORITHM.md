# API Comparison Algorithm Documentation

## Overview
The API comparison algorithm is the core engine of the API Compare tool, designed to intelligently compare API responses between different environments and provide meaningful insights about differences, similarities, and potential issues.

## Comparison Modes

### 1. Production vs Localhost Mode
Compares API responses between production and local development environments.

**Use Cases:**
- Testing local changes before deployment
- Debugging production issues locally
- Validating feature parity

**Example:**
```bash
# Production API
curl -X GET "https://api.example.com/users/123" \
     -H "Authorization: Bearer prod_token"

# Localhost API  
curl -X GET "http://localhost:3000/users/123" \
     -H "Authorization: Bearer dev_token"
```

### 2. Custom Environment Mode
Compares any two API environments using side-by-side cURL inputs.

**Use Cases:**
- Staging vs Production comparisons
- Multiple staging environment testing
- Cross-region API validation
- API version migration testing

**Example:**
```bash
# Environment A (Staging)
curl -X GET "https://staging.api.example.com/products" \
     -H "API-Key: staging_key"

# Environment B (Production)
curl -X GET "https://api.example.com/products" \
     -H "API-Key: prod_key"
```

## Core Algorithm Components

### 1. Response Normalization
Before comparison, responses undergo normalization:
- **JSON Formatting**: Pretty-print and standardize JSON structure
- **Header Standardization**: Convert headers to consistent case
- **Timestamp Handling**: Identify and optionally ignore timestamp fields
- **ID Field Recognition**: Smart detection of unique identifiers

### 2. Comparison Strategies

#### Deep Object Comparison
Recursively compares nested JSON structures:
```javascript
{
  "user": {
    "id": 123,          // Exact match
    "name": "John",     // Exact match
    "email": "..."      // Field comparison
  }
}
```

#### Array Comparison
Multiple strategies for array handling:
- **Order-sensitive**: Elements must match by position
- **Order-insensitive**: Elements can appear in any order
- **Key-based**: Match array elements by specific key field

Example:
```javascript
// Order-sensitive comparison
API_1: [{"id": 1}, {"id": 2}, {"id": 3}]
API_2: [{"id": 1}, {"id": 2}, {"id": 3}]
Result: ✅ Match

// Order-insensitive comparison  
API_1: [{"id": 1}, {"id": 2}, {"id": 3}]
API_2: [{"id": 3}, {"id": 1}, {"id": 2}]
Result: ✅ Match (when order-insensitive mode enabled)
```

#### Type Comparison
Strict type checking with configurable tolerance:
```javascript
// Strict mode
API_1: {"count": 10}      // number
API_2: {"count": "10"}    // string
Result: ❌ Type mismatch

// Tolerant mode
API_1: {"count": 10}      // number
API_2: {"count": "10"}    // string  
Result: ⚠️ Warning (coercible types)
```

### 3. Difference Detection

#### Field-Level Differences
```javascript
// API 1 Response
{
  "status": "active",
  "count": 100,
  "timestamp": "2024-01-30T10:00:00Z"
}

// API 2 Response
{
  "status": "inactive",  // ← Different value
  "count": 100,
  "timestamp": "2024-01-30T10:00:01Z"  // ← Ignorable difference
}

// Comparison Result
{
  "differences": [
    {
      "path": "status",
      "api1": "active",
      "api2": "inactive",
      "type": "value_mismatch"
    }
  ]
}
```

#### Structural Differences
```javascript
// Missing fields
API_1: {"name": "Product", "price": 99.99}
API_2: {"name": "Product"}
Result: Field "price" missing in API_2

// Extra fields
API_1: {"name": "Product"}
API_2: {"name": "Product", "category": "Electronics"}
Result: Field "category" only present in API_2

// Type differences
API_1: {"data": [...]}  // array
API_2: {"data": {...}}  // object
Result: Structural mismatch at path "data"
```

### 4. Intelligent Filtering

#### Ignorable Fields
Configure fields to exclude from comparison:
```javascript
{
  "ignoreFields": [
    "timestamp",
    "requestId",
    "*.createdAt",  // Wildcard support
    "**.id"         // Deep wildcard
  ]
}
```

#### Dynamic Value Detection
Automatically identifies likely dynamic values:
- UUIDs and GUIDs
- Timestamps (ISO 8601, Unix epoch)
- Session tokens
- Request IDs
- Hash values

### 5. Comparison Output Formats

#### Summary View
```
Comparison Results:
✅ Status Codes: Match (200)
⚠️  Response Time: API_1 (245ms) vs API_2 (512ms)
❌ Response Body: 3 differences found
✅ Headers: Match (12/12)
```

#### Detailed Diff View
```diff
{
  "user": {
    "name": "John Doe",
-   "role": "admin",
+   "role": "user",
    "permissions": [
      "read",
-     "write",
-     "delete"
+     "write"
    ]
  }
}
```

#### Side-by-Side View
```
API_1                    |  API_2
-------------------------|-------------------------
{                        |  {
  "status": "success",   |    "status": "success",
  "count": 42,          |    "count": 43,        ← 
  "items": [...]        |    "items": [...]
}                        |  }
```

## Advanced Features

### 1. Fuzzy Matching
For near-matches and typo detection:
```javascript
API_1: {"colour": "red"}
API_2: {"color": "red"}
Result: Possible field name variation detected
```

### 2. Performance Comparison
Beyond response content:
- Response time analysis
- Payload size comparison
- Header count and size
- Compression efficiency

### 3. Schema Validation
Ensures responses conform to expected structure:
```javascript
{
  "expectedSchema": {
    "type": "object",
    "required": ["id", "name"],
    "properties": {
      "id": {"type": "number"},
      "name": {"type": "string"}
    }
  }
}
```

### 4. Historical Comparison
Track changes over time:
- Regression detection
- Performance trending
- API evolution tracking

## Configuration Options

```javascript
{
  "comparison": {
    "mode": "deep",              // deep | shallow | schema
    "arrayMode": "ordered",      // ordered | unordered | key-based
    "typeStrict": true,          // Strict type checking
    "ignoreCase": false,         // Case-sensitive string comparison
    "ignoreDynamicFields": true, // Auto-detect dynamic values
    "customIgnorePatterns": [],  // Additional ignore patterns
    "fuzzyMatch": {
      "enabled": false,
      "threshold": 0.8          // Similarity threshold (0-1)
    },
    "performance": {
      "compareResponseTime": true,
      "responseTimeThreshold": 100  // ms difference to flag
    }
  }
}
```

## Example Comparison Scenarios

### Scenario 1: API Version Migration
```bash
# v1 API
curl "https://api.example.com/v1/users"

# v2 API  
curl "https://api.example.com/v2/users"

# Expected differences:
# - Field naming (user_name → userName)
# - Response structure (flat → nested)
# - New optional fields in v2
```

### Scenario 2: Multi-Region Testing
```bash
# US Region
curl "https://us.api.example.com/data"

# EU Region
curl "https://eu.api.example.com/data"

# Focus on:
# - Response times
# - Data consistency
# - Region-specific fields
```

### Scenario 3: Load Testing Validation
```bash
# Normal load
curl "https://api.example.com/search?q=test"

# Under load (via load balancer)
curl "https://lb.api.example.com/search?q=test"

# Compare:
# - Response completeness
# - Error rates
# - Timeout handling
```

## Best Practices

1. **Configure Ignore Lists**: Set up appropriate ignore patterns for dynamic fields
2. **Use Appropriate Modes**: Choose comparison mode based on API characteristics
3. **Validate Schema First**: Ensure structural compatibility before deep comparison
4. **Monitor Performance**: Track response time trends alongside content differences
5. **Document Expected Differences**: Maintain a list of known, acceptable differences
6. **Version Your Comparisons**: Save comparison configurations for reproducibility

## Troubleshooting Common Issues

### False Positives
- **Issue**: Timestamp fields causing constant mismatches
- **Solution**: Add timestamp patterns to ignore list

### Array Order Issues
- **Issue**: Arrays with same content showing as different
- **Solution**: Switch to unordered array comparison mode

### Type Coercion Problems
- **Issue**: Numbers as strings causing type mismatches
- **Solution**: Enable type coercion or implement custom normalization

### Large Response Handling
- **Issue**: Timeout or memory issues with large payloads
- **Solution**: Use streaming comparison or implement pagination

## Future Enhancements

- **Machine Learning Integration**: Automatic pattern detection and anomaly identification
- **GraphQL Support**: Specialized comparison for GraphQL responses
- **WebSocket Comparison**: Real-time message stream comparison
- **Binary Response Support**: Compare non-text responses (images, files)
- **Distributed Tracing**: Correlate API differences with backend service behavior