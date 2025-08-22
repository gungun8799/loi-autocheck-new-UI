# Permanent Fixed Deposit Validation Flow (3-Part Structure)

## Overview
Deposit validation for Permanent Fixed contracts (LO/LR) is split into 3 parts to prevent 504 timeouts while maintaining comprehensive business rules.

## Business Rules Summary

### Part 1: ATM Rules (Priority Check)
- **ATM-SCB + GoFresh** → No deposit required (0 months)
- **Other ATM + GoFresh** → 1 month deposit

### Part 2: LO/LR Special Rules
- **LR + Big Tenant** → 3 months deposit
- **LO + Major Property (Hypermarket/Value/Department)** → 4 months deposit

### Part 3: Local Tenant & Default Rules
- **Local Tenant + Small Format (Supermarket/GoFresh)** → 2 months deposit
- **Local Tenant with Cell Location** → 2 months deposit
- **Default Rule** → 3 months deposit

## Processing Flow

```
Start → Part 1 (ATM Rules)
         ├─ If match found → Return result
         └─ If no match (valid=null) → Continue to Part 2
         
         Part 2 (LO/LR Rules)
         ├─ If match found → Return result
         └─ If no match (valid=null) → Continue to Part 3
         
         Part 3 (Local & Default)
         └─ Always returns final result (never null)
```

## Implementation Details

### Server Processing
1. Server calls `deposits_part1` first
2. If result.valid === null, calls `deposits_part2`
3. If result.valid === null, calls `deposits_part3`
4. Part 3 always returns true/false (never null)

### Web vs PDF Validation
- **PDF**: Uses `pdf_validation/deposits_part[1-3].txt`
- **Web**: Uses `web_validation/deposits_part[1-3].txt`
- Both apply identical business rules
- Web validation sums Rental + Service deposits for total

### Response Format
```json
{
  "field": "Tenancy Deposit",
  "value": "300000.00",
  "valid": true,
  "reason": "LR + Big Tenant = 3 months required"
}
```

## Benefits
- ✅ Prevents 504 timeouts with smaller prompts
- ✅ Maintains all 6 business rules
- ✅ Consistent between PDF and Web validation
- ✅ Clear rule priority and flow
- ✅ Detailed reasoning in responses

## Validation Categories Order

### PDF Validation
```javascript
['required', 'business_part1', 'business_part2', 'business_part3', 
 'business_part4a', 'business_part4b', 'business_part5', 
 'deposits_part1', 'deposits_part2', 'deposits_part3', 
 'signatures', 'citizen_id_part1', 'citizen_id_part2a', 'citizen_id_part2b']
```

### Web Validation
```javascript
['basic', 'financial_part1', 'financial_part2', 'contract_terms', 
 'business_part1', 'business_part2', 'business_part3', 
 'business_part4a', 'business_part4b', 'business_part5', 'business_part6', 
 'deposits_part1', 'deposits_part2', 'deposits_part3']
```