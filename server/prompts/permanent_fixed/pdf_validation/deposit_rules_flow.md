# Deposit Rules Validation Flow

## Overview
The deposit validation has been split into 4 parts to prevent 504 timeouts while maintaining all critical business logic.

## Validation Flow

### Part 1A: Low Rent Exception (`deposit_rules_part1.txt`)
- **Rule**: If Net Rent < 5000, deposit must be ≥ 1 × rent
- **Next**: If rent ≥ 5000, proceed to Part 1B
- **Size**: ~800 characters

### Part 1B: ATM Brand Exceptions (`deposit_rules_part1b.txt`)
- **Rules**: 
  - ATM SCB: Always valid
  - ATM KBANK + Go Fresh: deposit ≥ 1 × rent
- **Next**: If no ATM brand match, proceed to Part 2A
- **Size**: ~863 characters

### Part 2A: Non-Hypermarket Properties (`deposit_rules_part2.txt`)
- **Rule**: If Property Type ≠ "Hypermarket", deposit must be ≥ 2 × rent
- **Next**: If Property Type = "Hypermarket", proceed to Part 2B
- **Size**: ~904 characters

### Part 2B: Default/Hypermarket Rules (`deposit_rules_part2b.txt`)
- **Rule**: Default requirement - deposit must be ≥ 3 × rent
- **Final**: This is the final validation step
- **Size**: ~957 characters

## Server Implementation
The server should process these in sequence:
1. Call Part 1A first
2. If result.valid === null, call Part 1B
3. If result.valid === null, call Part 2A  
4. If result.valid === null, call Part 2B
5. Part 2B will always return true/false (never null)

## Benefits
- ✅ Maintains all critical business rules
- ✅ Reduces individual prompt complexity
- ✅ Should prevent 504 timeouts
- ✅ Clear validation flow
- ✅ Easier to debug individual rules