import PromptManager from './promptManager.js';
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// ===== UTILITY FUNCTION TO STRIP THINK TAGS =====
function stripThinkTags(response) {
  if (!response || typeof response !== 'string') {
    return response;
  }
  
  console.log('[DEBUG stripThinkTags] Input length:', response.length);
  console.log('[DEBUG stripThinkTags] First 200 chars:', response.substring(0, 200));
  console.log('[DEBUG stripThinkTags] Last 200 chars:', response.substring(response.length - 200));
  
  // First, remove properly closed <think>...</think> tags
  let cleaned = response.replace(/<think>[\s\S]*?<\/think>/gi, '');
  
  // For unclosed think tags, try to preserve JSON content that comes after
  if (cleaned.includes('<think>')) {
    console.log('[DEBUG stripThinkTags] Found unclosed think tag');
    
    // Remove the unclosed think tag and everything before it
    cleaned = cleaned.replace(/^[\s\S]*?<think>[\s\S]*?(?=[\[\{])/i, '');
  }
  
  // Try to extract valid JSON using bracket/brace counting
  const extractedJson = extractValidJson(cleaned);
  if (extractedJson) {
    console.log('[DEBUG stripThinkTags] Successfully extracted JSON using bracket counting');
    cleaned = extractedJson;
  }
  
  const result = cleaned.trim();
  console.log('[DEBUG stripThinkTags] Output length:', result.length);
  console.log('[DEBUG stripThinkTags] Output preview:', result.substring(0, 200));
  
  return result;
}

function extractValidJson(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }
  
  // Look for potential JSON start positions - arrays or objects
  const potentialStarts = [];
  
  // Find all potential array starts
  let pos = 0;
  while ((pos = text.indexOf('[', pos)) !== -1) {
    potentialStarts.push({ pos, type: 'array' });
    pos++;
  }
  
  // Find all potential object starts
  pos = 0;
  while ((pos = text.indexOf('{', pos)) !== -1) {
    potentialStarts.push({ pos, type: 'object' });
    pos++;
  }
  
  // Sort by position
  potentialStarts.sort((a, b) => a.pos - b.pos);
  
  // Try each potential start position
  for (const start of potentialStarts) {
    console.log(`[DEBUG extractValidJson] Trying ${start.type} at position ${start.pos}`);
    
    const jsonStr = tryExtractJsonFromPosition(text, start.pos, start.type === 'array');
    if (jsonStr) {
      console.log(`[DEBUG extractValidJson] Successfully extracted JSON from position ${start.pos}`);
      return jsonStr;
    }
  }
  
  console.log('[DEBUG extractValidJson] No valid JSON found');
  return null;
}

function tryExtractJsonFromPosition(text, startPos, isArray) {
  const openChar = isArray ? '[' : '{';
  const closeChar = isArray ? ']' : '}';
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  
  for (let i = startPos; i < text.length; i++) {
    const char = text[i];
    
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    
    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === openChar) {
        depth++;
      } else if (char === closeChar) {
        depth--;
        if (depth === 0) {
          // Found complete JSON candidate
          const jsonStr = text.substring(startPos, i + 1);
          console.log(`[DEBUG tryExtractJsonFromPosition] Found complete structure, length: ${jsonStr.length}`);
          
          // Validate it's actually valid JSON
          try {
            const parsed = JSON.parse(jsonStr);
            
            // For arrays, make sure it contains objects (validation results)
            if (isArray && Array.isArray(parsed) && parsed.length > 0) {
              // Check if first element looks like a validation result
              const firstElement = parsed[0];
              if (typeof firstElement === 'object' && 
                  firstElement !== null && 
                  ('field' in firstElement || 'status' in firstElement || 'match' in firstElement)) {
                console.log('[DEBUG tryExtractJsonFromPosition] Array contains validation-like objects');
                return jsonStr;
              }
            }
            
            // For objects, accept if it parses correctly
            if (!isArray && typeof parsed === 'object' && parsed !== null) {
              console.log('[DEBUG tryExtractJsonFromPosition] Valid object found');
              return jsonStr;
            }
            
            console.log('[DEBUG tryExtractJsonFromPosition] JSON structure doesn\'t look like validation data');
          } catch (e) {
            console.log('[DEBUG tryExtractJsonFromPosition] JSON validation failed:', e.message);
          }
          
          return null; // This position didn't work, but don't continue counting
        }
      }
    }
  }
  
  return null; // Incomplete structure
}

// Verify API key is loaded
// Lotus LLM Configuration
const LOTUS_LLM_URL = 'https://api-cpxis.lotuss.com/llm/v1/chat/completions';
const LOTUS_API_KEY = 'accounting.lotuss.F51DAF28FD6422DDF3CD864F833CC';

class SequentialProcessor {
  constructor() {
    this.promptManager = new PromptManager();
  }

  // Generic method for Lotus LLM API calls with custom parameters and retry logic
  async callLotusWithCustomRetry(messages, options = {}, maxRetries = 6, skipOnOverload = false) {
    const defaultOptions = {
      model: 'default',
      temperature: 0.1,
      max_tokens: 4000,
      chat_template_kwargs: { enable_thinking: false }
    };
    
    const requestOptions = { ...defaultOptions, ...options };
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(LOTUS_LLM_URL, {
          ...requestOptions,
          messages: messages
        }, {
          headers: {
            'Authorization': `Bearer ${LOTUS_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: options.timeout || 240000 // 4 minutes timeout (increased from 3 minutes)
        });

        // Handle new API response format where content might be in reasoning_content
        const messageContent = response.data.choices[0].message.content;
        const reasoningContent = response.data.choices[0].message.reasoning_content;
        return messageContent || reasoningContent;
        
      } catch (fetchError) {
        const isServiceOverloaded = (
          (fetchError.message && (
            fetchError.message.includes('503 Service Unavailable') || 
            fetchError.message.includes('504 Gateway Timeout') ||
            fetchError.message.includes('overloaded') ||
            fetchError.message.includes('429') ||
            fetchError.message.includes('Too Many Requests') ||
            fetchError.message.includes('Service Temporarily Unavailable') ||
            fetchError.message.includes('Request timeout') ||
            fetchError.message.includes('ECONNRESET') ||
            fetchError.message.includes('ETIMEDOUT')
          )) ||
          (fetchError.response && (
            fetchError.response.status === 503 ||
            fetchError.response.status === 504 ||
            fetchError.response.status === 429 ||
            fetchError.response.status === 502
          )) ||
          fetchError.code === 'ECONNRESET' ||
          fetchError.code === 'ETIMEDOUT'
        );
        
        if (isServiceOverloaded) {
          console.warn(`[⚠️ Lotus LLM API overloaded - attempt ${attempt}/${maxRetries}]`);
          
          // If skipOnOverload is true and we hit overload on first attempt, fail fast
          if (skipOnOverload && attempt === 1) {
            console.warn('[⚡ Fast-failing due to API overload to preserve resources]');
            throw new Error('LOTUS_OVERLOADED');
          }
        } else {
          console.warn(`[⚠️ Sequential Lotus LLM API attempt ${attempt}/${maxRetries} failed]`, fetchError.message);
          
          // Handle 400 errors (Bad Request) which usually indicate content too large
          if (fetchError.response && fetchError.response.status === 400) {
            console.error('[❌ Request too large (400 error) - content may need further truncation]');
            throw new Error('REQUEST_TOO_LARGE');
          }
        }
        
        if (attempt === maxRetries) {
          if (isServiceOverloaded) {
            console.error('[❌ Lotus LLM API consistently overloaded - please try again later]');
            throw new Error('LOTUS_OVERLOADED');
          } else {
            console.error('[❌ All Sequential Lotus LLM API attempts failed]');
            throw new Error(`Sequential Lotus LLM API failed after ${maxRetries} attempts: ${fetchError.message}`);
          }
        }
        
        // Improved backoff strategy for overloaded API
        let waitTime;
        if (isServiceOverloaded) {
          // For overloaded API, use longer initial delay with capped exponential backoff
          const baseDelay = 5000; // Start with 5 seconds for overload
          waitTime = Math.min(baseDelay * Math.pow(1.5, attempt - 1), 30000); // Cap at 30 seconds
        } else {
          // For other errors, use shorter delays
          const baseDelay = skipOnOverload ? 1000 : 2000;
          waitTime = baseDelay * Math.pow(1.5, attempt - 1);
        }
        
        // Add jitter to prevent thundering herd (±20% random variation)
        const jitter = waitTime * 0.2 * (Math.random() - 0.5);
        const finalWaitTime = Math.max(waitTime + jitter, 1000); // Minimum 1 second
        
        console.log(`[⏳ Sequential waiting ${Math.round(finalWaitTime)}ms before retry...]`);
        await new Promise(resolve => setTimeout(resolve, finalWaitTime));
      }
    }
  }

  // Helper method for Lotus LLM API calls with retry logic
  async callLotusWithRetry(prompt, maxRetries = 6, skipOnOverload = false) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(LOTUS_LLM_URL, {
          model: 'default',
          messages: [
            {
              role: 'system',
              content: 'You are a contract field extraction assistant. Return ONLY valid JSON without any markdown formatting, code blocks, or additional text. Do not use ```json or ``` markers.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.1,
          max_tokens: 4000,
          enable_thinking: false  // Disable thinking mode for faster responses
        }, {
          headers: {
            'Authorization': `Bearer ${LOTUS_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 240000 // 4 minutes timeout (increased from 3 minutes)
        });

        // Handle new API response format where content might be in reasoning_content
        const messageContent = response.data.choices[0].message.content;
        const reasoningContent = response.data.choices[0].message.reasoning_content;
        return messageContent || reasoningContent;
        
      } catch (fetchError) {
        const isServiceOverloaded = (
          (fetchError.message && (
            fetchError.message.includes('503 Service Unavailable') || 
            fetchError.message.includes('504 Gateway Timeout') ||
            fetchError.message.includes('overloaded') ||
            fetchError.message.includes('429') ||
            fetchError.message.includes('Too Many Requests') ||
            fetchError.message.includes('Service Temporarily Unavailable') ||
            fetchError.message.includes('Request timeout') ||
            fetchError.message.includes('ECONNRESET') ||
            fetchError.message.includes('ETIMEDOUT')
          )) ||
          (fetchError.response && (
            fetchError.response.status === 503 ||
            fetchError.response.status === 504 ||
            fetchError.response.status === 429 ||
            fetchError.response.status === 502
          )) ||
          fetchError.code === 'ECONNRESET' ||
          fetchError.code === 'ETIMEDOUT'
        );
        
        if (isServiceOverloaded) {
          console.warn(`[⚠️ Lotus LLM API overloaded - attempt ${attempt}/${maxRetries}]`);
          
          // If skipOnOverload is true and we hit overload on first attempt, fail fast
          if (skipOnOverload && attempt === 1) {
            console.warn('[⚡ Fast-failing due to API overload to preserve resources]');
            throw new Error('LOTUS_OVERLOADED');
          }
        } else {
          console.warn(`[⚠️ Sequential Lotus LLM API attempt ${attempt}/${maxRetries} failed]`, fetchError.message);
          
          // Handle 400 errors (Bad Request) which usually indicate content too large
          if (fetchError.response && fetchError.response.status === 400) {
            console.error('[❌ Request too large (400 error) - content may need further truncation]');
            throw new Error('REQUEST_TOO_LARGE');
          }
        }
        
        if (attempt === maxRetries) {
          if (isServiceOverloaded) {
            console.error('[❌ Lotus LLM API consistently overloaded - please try again later]');
            throw new Error('LOTUS_OVERLOADED');
          } else {
            console.error('[❌ All Sequential Lotus LLM API attempts failed]');
            throw new Error(`Sequential Lotus LLM API failed after ${maxRetries} attempts: ${fetchError.message}`);
          }
        }
        
        // Improved backoff strategy for overloaded API
        let waitTime;
        if (isServiceOverloaded) {
          // For overloaded API, use longer initial delay with capped exponential backoff
          const baseDelay = 5000; // Start with 5 seconds for overload
          waitTime = Math.min(baseDelay * Math.pow(1.5, attempt - 1), 30000); // Cap at 30 seconds
        } else {
          // For other errors, use shorter delays
          const baseDelay = skipOnOverload ? 1000 : 2000;
          waitTime = baseDelay * Math.pow(1.5, attempt - 1);
        }
        
        // Add jitter to prevent thundering herd (±20% random variation)
        const jitter = waitTime * 0.2 * (Math.random() - 0.5);
        const finalWaitTime = Math.max(waitTime + jitter, 1000); // Minimum 1 second
        
        console.log(`[⏳ Sequential waiting ${Math.round(finalWaitTime)}ms before retry...]`);
        await new Promise(resolve => setTimeout(resolve, finalWaitTime));
      }
    }
  }

  // Process PDF/Web content in sequential steps
  async processSequential(content, contractType, sourceType = 'pdf', contractNumber = null) {
    const steps = [
      'basic_info',
      'tenant_info', 
      'lease_terms',
      'service_charges',
      'utilities',
      'signatures',
      'citizen_id'
    ];

    let combinedResult = {};
    let isLotusOverloaded = false;
    
    // Extract contract number from content if not provided
    if (!contractNumber && content) {
      const contractMatch = content.match(/\d{4}_L[OR]\d{4}_\d{5}/);
      contractNumber = contractMatch ? contractMatch[0] : null;
    }
    
    const config = this.promptManager.getContractConfig(contractType, contractNumber);
    console.log(`[Sequential] Starting ${sourceType.toUpperCase()} processing for ${config.key}`);
    
    // Log full PDF raw text extraction for debugging
    if (sourceType === 'pdf') {
      console.log(`[PDF RAW TEXT] Full extracted content (${content.length} chars):`);
      console.log('='.repeat(80));
      console.log(content);
      console.log('='.repeat(80));
    }

    for (const step of steps) {
      try {
        console.log(`[Sequential] Processing step: ${step}`);
        
        const prompt = this.promptManager.createSequentialPrompt('fields', step, contractType, contractNumber, sourceType);
        
        // Limit content size to prevent 400 errors
        // Use different limits based on step type (some steps need more context)
        const maxContentLength = step === 'lease_terms' ? 20000 : 15000;
        let limitedContent = content;
        
        if (content.length > maxContentLength) {
          // For signatures step, intelligently find signature-related content
          if (step === 'signatures') {
            limitedContent = this.extractSignatureContent(content, maxContentLength);
          } else if (step === 'citizen_id' && contractType === 'service_express') {
            // For service express citizen_id, use smart extraction for pages 7-15
            limitedContent = this.extractCitizenIdContent(content, maxContentLength, contractType);
          } else if (step === 'service_charges' && contractType === 'permanent_fixed') {
            // For permanent fixed service_charges, use smart extraction to find service charge patterns
            limitedContent = this.extractServiceChargesContent(content, maxContentLength, contractType);
          } else {
            // For PDFs with page markers, try to keep first 5 pages and last 2 pages
            const pagePattern = /Page \d+/g;
            const pages = content.match(pagePattern);
            
            if (pages && pages.length > 7) {
              // Extract first 5 pages worth of content
              const page6Index = content.indexOf('Page 6');
              const firstPart = page6Index > 0 ? content.substring(0, page6Index) : content.substring(0, maxContentLength * 0.7);
              
              // Extract last 2 pages worth of content  
              const lastPageIndex = content.lastIndexOf('Page ' + (pages.length - 1));
              const lastPart = lastPageIndex > 0 ? content.substring(lastPageIndex) : content.substring(content.length - maxContentLength * 0.3);
              
              limitedContent = firstPart + '\n\n[... middle content truncated for processing ...]\n\n' + lastPart;
              console.log(`[Sequential] Content truncated from ${content.length} to ${limitedContent.length} chars (kept first 5 and last 2 pages)`);
            } else {
              // Simple truncation for non-paginated content
              limitedContent = content.substring(0, maxContentLength);
              console.log(`[Sequential] Content truncated from ${content.length} to ${maxContentLength} chars`);
            }
          }
        }
        
        const finalPrompt = `${prompt}\n\nContent:\n${limitedContent}`;
        
        // === CLEAR EXTRACTION LOGGING ===
        console.log(`\n${'█'.repeat(120)}`);
        console.log(`██ STEP: ${step.toUpperCase()} | CONTRACT: ${contractType} | SOURCE: ${sourceType.toUpperCase()} ██`);
        console.log(`${'█'.repeat(120)}`);
        
        console.log(`\n${'▓'.repeat(80)}`);
        console.log(`▓▓ 1) PROMPT FILE BEING USED ▓▓`);
        console.log(`${'▓'.repeat(80)}`);
        console.log(`Prompt Length: ${prompt.length} characters`);
        console.log(`\n${prompt}`);
        
        console.log(`\n${'▓'.repeat(80)}`);
        console.log(`▓▓ 2) RAW TEXT BEING SENT FOR PROCESSING ▓▓`);
        console.log(`${'▓'.repeat(80)}`);
        console.log(`Content Length: ${limitedContent.length} characters`);
        console.log(`\n${limitedContent}`);
        
        console.log(`\n${'▓'.repeat(80)}`);
        console.log(`▓▓ 3) EXTRACTION RESULT (will be shown after LLM response) ▓▓`);
        console.log(`${'▓'.repeat(80)}`);
        
        // Use fast-fail mode after first overload detection to avoid long waits
        const responseText = await this.callLotusWithRetry(finalPrompt, 3, isLotusOverloaded);
        const withoutThinkTags = stripThinkTags(responseText);
        const cleanedResponse = this.cleanLotusJson(withoutThinkTags);
        
        try {
          const stepResult = JSON.parse(cleanedResponse);
          combinedResult = { ...combinedResult, ...stepResult };
          
          // === SHOW EXTRACTION RESULT ===
          console.log(`\n${'▓'.repeat(80)}`);
          console.log(`▓▓ 3) EXTRACTION RESULT - ${Object.keys(stepResult).length} FIELDS EXTRACTED ▓▓`);
          console.log(`${'▓'.repeat(80)}`);
          Object.entries(stepResult).forEach(([field, value]) => {
            console.log(`"${field}": ${JSON.stringify(value)}`);
          });
          
          console.log(`\n${'█'.repeat(120)}`);
          console.log(`██ STEP ${step.toUpperCase()} COMPLETED SUCCESSFULLY ██`);
          console.log(`${'█'.repeat(120)}\n`);
        } catch (parseErr) {
          console.log(`\n${'█'.repeat(120)}`);
          console.log(`██ STEP ${step.toUpperCase()} FAILED - PARSE ERROR ██`);
          console.log(`${'█'.repeat(120)}`);
          console.log(`Error: ${parseErr.message}`);
          console.log(`Raw Response: ${cleanedResponse}`);
          console.log(`${'█'.repeat(120)}\n`);
        }

        // Increased delay between requests to prevent 504 gateway timeouts
        await new Promise(resolve => setTimeout(resolve, 3000));
        
      } catch (err) {
        console.error(`[Sequential] Error in step ${step}:`, err.message);
        
        // If Lotus is overloaded, set flag to use fast-fail mode for remaining steps
        if (err.message === 'LOTUS_OVERLOADED') {
          isLotusOverloaded = true;
          console.warn('[⚡ Detected Lotus overload - switching to fast-fail mode for remaining steps]');
        }
        
        // Continue with other steps even if one fails
      }
    }

    console.log(`[Sequential] Completed ${sourceType.toUpperCase()} processing, total fields: ${Object.keys(combinedResult).length}`);
    return combinedResult;
  }

  // Process validation in parallel batches
  async processValidation(extractedData, contractType = null, contractNumber = null, sourceType = 'pdf') {
    const validationCategories = [
      'required',
      'business_part1',
      'business_part2',
      'business_part3',
      'business_part4',
      'deposits_part1',
      'deposits_part2',
      'deposits_part3',
      'signatures',
      'citizen_id_part1',
      'citizen_id_part2a',
      'citizen_id_part2b'
    ];

    let allValidations = [];
    
    // Extract contract number from data if not provided
    if (!contractNumber && extractedData && extractedData['Contract Number']) {
      contractNumber = extractedData['Contract Number'];
    }
    
    const config = contractType ? this.promptManager.getContractConfig(contractType, contractNumber) : null;
    console.log(`[Sequential] Starting ${sourceType.toUpperCase()} validation processing${config ? ` for ${config.key}` : ''}`);

    for (const category of validationCategories) {
      try {
        console.log(`[Sequential] Validating category: ${category}`);
        
        const prompt = this.promptManager.createValidationPrompt(category, contractType, contractNumber, sourceType);
        
        // Skip if prompt is null (e.g., web validation skipping signatures)
        if (!prompt) {
          console.log(`[Sequential] Skipping ${category} validation for ${sourceType} data (not applicable)`);
          continue;
        }
        // Limit extracted data size to prevent 400 errors
        let dataString = JSON.stringify(extractedData, null, 2);
        if (dataString.length > 25000) {
          // Truncate data if too large, keeping structure intact
          const truncatedData = JSON.stringify(extractedData);
          if (truncatedData.length > 25000) {
            dataString = truncatedData.substring(0, 25000) + '... [data truncated]';
          } else {
            dataString = truncatedData;
          }
          console.log(`[Sequential] Extracted data truncated for validation from ${JSON.stringify(extractedData, null, 2).length} to ${dataString.length} chars`);
        }
        
        const finalPrompt = `${prompt}\n\nExtracted Data:\n${dataString}`;
        
        // === DETAILED VALIDATION LOGGING ===
        console.log(`\n${'='.repeat(100)}`);
        console.log(`[VALIDATION LOG] Category: ${category} | Contract Type: ${contractType} | Source: ${sourceType}`);
        console.log(`[VALIDATION LOG] Prompt Length: ${prompt.length} chars`);
        console.log(`[VALIDATION LOG] Data Length: ${dataString.length} chars`);
        console.log(`\n--- VALIDATION PROMPT ---`);
        console.log(prompt.substring(0, 1000) + (prompt.length > 1000 ? '...[truncated]' : ''));
        console.log(`\n--- EXTRACTED DATA BEING VALIDATED ---`);
        console.log(dataString);
        console.log(`${'='.repeat(100)}\n`);
        
        const responseText = await this.callLotusWithRetry(finalPrompt);
        const withoutThinkTags = stripThinkTags(responseText);
        const cleanedResponse = this.cleanLotusJson(withoutThinkTags);
        
        // === LOG VALIDATION RESPONSE ===
        console.log(`\n--- VALIDATION RESPONSE (${category}) ---`);
        console.log(responseText);
        console.log(`\n--- CLEANED VALIDATION RESPONSE (${category}) ---`);
        console.log(cleanedResponse);
        
        try {
          const validationResult = JSON.parse(cleanedResponse);
          if (Array.isArray(validationResult)) {
            allValidations = [...allValidations, ...validationResult];
            console.log(`\n--- VALIDATION RESULTS (${category}) ---`);
            validationResult.forEach((result, index) => {
              console.log(`${index + 1}. Field: "${result.field}" | Status: ${result.status} | Match: ${result.match}`);
            });
            console.log(`\n[Sequential] Validation ${category} completed, ${validationResult.length} checks`);
          }
        } catch (parseErr) {
          console.warn(`[Sequential] Failed to parse validation ${category}:`, parseErr.message);
          console.log(`[Sequential] Parse error for validation response: ${cleanedResponse}`);
        }

        await new Promise(resolve => setTimeout(resolve, 3000));

      } catch (err) {
        console.error(`[Sequential] Error in validation ${category}:`, err.message);
      }
    }

    console.log(`[Sequential] Completed validation processing, total checks: ${allValidations.length}`);
    return allValidations;
  }

  // Process comparison in focused batches  
  async processComparison(pdfData, webData, contractType = null, contractNumber = null) {
    const comparisonCategories = [
      'basic',
      'lease_terms',
      'service_charges', 
      'utilities',
      'tax_deposits'
    ];

    let allComparisons = [];
    
    // Extract contract number from data if not provided
    if (!contractNumber) {
      contractNumber = pdfData?.['Contract Number'] || webData?.['Contract Number'] || null;
    }
    
    const config = contractType ? this.promptManager.getContractConfig(contractType, contractNumber) : null;
    console.log(`[Sequential] Starting comparison processing${config ? ` for ${config.key}` : ''}`);

    for (const category of comparisonCategories) {
      try {
        console.log(`[Sequential] Comparing category: ${category}`);
        
        const prompt = this.promptManager.createComparisonPrompt(category, contractType, contractNumber);
        
        // Limit comparison data size to prevent 400 errors
        let pdfString = JSON.stringify(pdfData, null, 2);
        let webString = JSON.stringify(webData, null, 2);
        
        if (pdfString.length > 15000) {
          pdfString = JSON.stringify(pdfData).substring(0, 15000) + '... [data truncated]';
          console.log(`[Sequential] PDF data truncated for comparison`);
        }
        if (webString.length > 15000) {
          webString = JSON.stringify(webData).substring(0, 15000) + '... [data truncated]';
          console.log(`[Sequential] Web data truncated for comparison`);
        }
        
        const sourcesString = `PDF: ${pdfString}\n\nWEB: ${webString}`;
        const finalPrompt = `${prompt}\n\nSources:\n${sourcesString}`;
        
        // === DETAILED COMPARISON LOGGING ===
        console.log(`\n${'='.repeat(100)}`);
        console.log(`[COMPARISON LOG] Category: ${category} | Contract Type: ${contractType}`);
        console.log(`[COMPARISON LOG] Prompt Length: ${prompt.length} chars`);
        console.log(`[COMPARISON LOG] PDF Data Length: ${pdfString.length} chars`);
        console.log(`[COMPARISON LOG] Web Data Length: ${webString.length} chars`);
        console.log(`\n--- COMPARISON PROMPT ---`);
        console.log(prompt.substring(0, 1000) + (prompt.length > 1000 ? '...[truncated]' : ''));
        console.log(`\n--- PDF DATA BEING COMPARED ---`);
        console.log(pdfString);
        console.log(`\n--- WEB DATA BEING COMPARED ---`);
        console.log(webString);
        console.log(`${'='.repeat(100)}\n`);
        
        const responseText = await this.callLotusWithRetry(finalPrompt);
        const withoutThinkTags = stripThinkTags(responseText);
        const cleanedResponse = this.cleanLotusJson(withoutThinkTags);
        
        // === LOG COMPARISON RESPONSE ===
        console.log(`\n--- COMPARISON RESPONSE (${category}) ---`);
        console.log(responseText);
        console.log(`\n--- CLEANED COMPARISON RESPONSE (${category}) ---`);
        console.log(cleanedResponse);
        
        try {
          const comparisonResult = JSON.parse(cleanedResponse);
          if (Array.isArray(comparisonResult)) {
            allComparisons = [...allComparisons, ...comparisonResult];
            console.log(`\n--- COMPARISON RESULTS (${category}) ---`);
            comparisonResult.forEach((result, index) => {
              console.log(`${index + 1}. Field: "${result.field}" | PDF: ${JSON.stringify(result.pdf)} | Web: ${JSON.stringify(result.web)} | Match: ${result.match}`);
            });
            console.log(`\n[Sequential] Comparison ${category} completed, ${comparisonResult.length} fields compared`);
          }
        } catch (parseErr) {
          console.warn(`[Sequential] Failed to parse comparison ${category}:`, parseErr.message);
          console.log(`[Sequential] Parse error for comparison response: ${cleanedResponse}`);
        }

        await new Promise(resolve => setTimeout(resolve, 3000));

      } catch (err) {
        console.error(`[Sequential] Error in comparison ${category}:`, err.message);
      }
    }

    console.log(`[Sequential] Completed comparison processing, total comparisons: ${allComparisons.length}`);
    return allComparisons;
  }

  // Extract service charges content for permanent fixed contracts
  extractServiceChargesContent(content, maxLength, contractType) {
    console.log(`[Service Charges Extraction] Starting for ${contractType} with content length: ${content.length}`);
    
    if (contractType === 'permanent_fixed') {
      // Search for Thai service charge patterns commonly found in permanent fixed contracts
      const serviceChargePatterns = [
        /ค่าบริการพิเศษ/g,                          // Special service charges
        /ค่าบริการ.*ไอเย็น/g,                       // Air conditioning service charges  
        /ค่าบริการ.*ไฟฟ้า/g,                       // Electricity service charges
        /เดือนละ.*บาท/g,                           // Monthly amount patterns
        /ตั้งแต่วันที่.*จนถึงวันที่/g,              // Date range patterns
        /Other.*service.*charge/gi,                 // English service charge patterns
        /Cool.*Air.*Service.*Fee/gi,                // Cool air service fee patterns
        /สถานที่เช่า/g,                           // Renting space patterns
        /พื้นที่ส่วนกลาง/g                          // Common area patterns
      ];
      
      const chargeMatches = [];
      serviceChargePatterns.forEach((pattern, patternIndex) => {
        const matches = [...content.matchAll(pattern)];
        matches.forEach(match => {
          chargeMatches.push({
            position: match.index,
            text: match[0],
            pattern: pattern.source,
            patternIndex: patternIndex
          });
        });
      });
      
      console.log(`[Service Charges Extraction] Found ${chargeMatches.length} service charge patterns`);
      
      if (chargeMatches.length > 0) {
        // Sort by position and find clusters of service charge information
        chargeMatches.sort((a, b) => a.position - b.position);
        
        // Group matches that are close together (within 5000 chars)
        const clusters = [];
        let currentCluster = [chargeMatches[0]];
        
        for (let i = 1; i < chargeMatches.length; i++) {
          const match = chargeMatches[i];
          const lastInCluster = currentCluster[currentCluster.length - 1];
          
          if (match.position - lastInCluster.position <= 5000) {
            currentCluster.push(match);
          } else {
            clusters.push(currentCluster);
            currentCluster = [match];
          }
        }
        clusters.push(currentCluster);
        
        // Find the cluster with the most diverse patterns (likely the main service charges section)
        let bestCluster = clusters[0];
        let maxPatternDiversity = new Set(clusters[0].map(m => m.patternIndex)).size;
        
        for (const cluster of clusters) {
          const patternDiversity = new Set(cluster.map(m => m.patternIndex)).size;
          if (patternDiversity > maxPatternDiversity) {
            maxPatternDiversity = patternDiversity;
            bestCluster = cluster;
          }
        }
        
        // Extract content around the best cluster
        const firstMatch = bestCluster[0].position;
        const lastMatch = bestCluster[bestCluster.length - 1].position;
        
        const contextBuffer = 4000; // Large buffer to capture full service charge sections
        const startPos = Math.max(0, firstMatch - contextBuffer);
        const endPos = Math.min(content.length, lastMatch + contextBuffer);
        
        let serviceChargeContent = content.substring(startPos, endPos);
        
        if (serviceChargeContent.length > maxLength) {
          // If still too long, prioritize content around the cluster center
          const clusterCenter = (firstMatch + lastMatch) / 2;
          const halfLength = maxLength / 2;
          const newStart = Math.max(0, clusterCenter - halfLength);
          const newEnd = Math.min(content.length, clusterCenter + halfLength);
          serviceChargeContent = content.substring(newStart, newEnd);
        }
        
        console.log(`[Service Charges Extraction] Using pattern cluster range: ${startPos} to ${endPos}`);
        console.log(`[Service Charges Extraction] Best cluster has ${bestCluster.length} patterns with ${maxPatternDiversity} different types`);
        
        // Log some pattern examples found
        bestCluster.slice(0, 5).forEach((match, i) => {
          console.log(`  ${i + 1}. Position ${match.position}: "${match.text}"`);
        });
        
        return serviceChargeContent;
      }
      
      // Fallback: Look for service charges in specific page ranges where they commonly appear
      console.log(`[Service Charges Extraction] No patterns found, trying page-based extraction`);
      
      const pagePattern = /Page \d+/g;
      const pages = content.match(pagePattern);
      
      if (pages && pages.length > 8) {
        // For permanent fixed, service charges often appear in pages 4-8
        const page4Pattern = /Page 4\b/;
        const page4Match = content.match(page4Pattern);
        
        if (page4Match) {
          const page4Start = page4Match.index;
          
          // Try to get pages 4-8
          const page9Pattern = /Page 9\b/;
          const page9Match = content.match(page9Pattern);
          
          let extractEnd;
          if (page9Match) {
            extractEnd = page9Match.index;
            console.log(`[Service Charges Extraction] Extracting pages 4-8`);
          } else {
            extractEnd = Math.min(page4Start + maxLength, content.length);
            console.log(`[Service Charges Extraction] Extracting from page 4 for ${maxLength} chars`);
          }
          
          let serviceChargeContent = content.substring(page4Start, extractEnd);
          
          if (serviceChargeContent.length > maxLength) {
            serviceChargeContent = serviceChargeContent.substring(0, maxLength);
          }
          
          console.log(`[Service Charges Extraction] Extracted pages 4-8 content: ${serviceChargeContent.length} chars`);
          return serviceChargeContent;
        }
      }
    }
    
    // Final fallback: Use middle portion of document where service charges typically appear
    console.log(`[Service Charges Extraction] Using middle portion extraction`);
    const middleStart = Math.floor(content.length * 0.3); // Start at 30% through document
    const middleEnd = Math.min(middleStart + maxLength, content.length);
    return content.substring(middleStart, middleEnd);
  }

  // Extract citizen ID content for service express contracts (pages 7-15)
  extractCitizenIdContent(content, maxLength, contractType) {
    console.log(`[Citizen ID Extraction] Starting for ${contractType} with content length: ${content.length}`);
    
    if (contractType === 'service_express') {
      // For service express, citizen IDs are typically on pages 7-15
      const pagePattern = /Page \d+/g;
      const pages = content.match(pagePattern);
      
      if (pages && pages.length >= 10) {
        // Try to extract pages 7-15 specifically
        console.log(`[Citizen ID Extraction] Document has ${pages.length} pages, extracting pages 7-15`);
        
        // Find the start of page 7
        const page7Pattern = /Page 7\b/;
        const page7Match = content.match(page7Pattern);
        
        if (page7Match) {
          const page7Start = page7Match.index;
          
          // Try to find the end of page 15 or start of page 16
          const page16Pattern = /Page 16\b/;
          const page16Match = content.match(page16Pattern);
          
          let extractEnd;
          if (page16Match) {
            extractEnd = page16Match.index;
            console.log(`[Citizen ID Extraction] Extracting from Page 7 to start of Page 16`);
          } else {
            // If no page 16, take content up to maxLength from page 7
            extractEnd = Math.min(page7Start + maxLength, content.length);
            console.log(`[Citizen ID Extraction] Extracting from Page 7 for ${maxLength} chars`);
          }
          
          let citizenContent = content.substring(page7Start, extractEnd);
          
          // If still too long, truncate to maxLength
          if (citizenContent.length > maxLength) {
            citizenContent = citizenContent.substring(0, maxLength);
            console.log(`[Citizen ID Extraction] Content truncated to ${maxLength} chars`);
          }
          
          // Look for Thai ID patterns (13 digits) to confirm we have the right content
          const idPattern = /\d{1}[\s-]?\d{4}[\s-]?\d{5}[\s-]?\d{2}[\s-]?\d{1}/g;
          const idMatches = citizenContent.match(idPattern);
          
          if (idMatches) {
            console.log(`[Citizen ID Extraction] Found ${idMatches.length} potential Thai ID numbers`);
            idMatches.forEach((id, i) => {
              console.log(`  ${i + 1}. ${id}`);
            });
          }
          
          console.log(`[Citizen ID Extraction] Extracted pages 7-15 content: ${citizenContent.length} chars`);
          return citizenContent;
        }
      }
      
      // Fallback: Look for ID patterns throughout the document
      console.log(`[Citizen ID Extraction] Pages 7-15 extraction failed, searching for ID patterns`);
      
      // Thai ID pattern with flexible spacing/formatting
      const idPattern = /\d{1}[\s-]?\d{4}[\s-]?\d{5}[\s-]?\d{2}[\s-]?\d{1}/g;
      const idMatches = [...content.matchAll(idPattern)];
      
      if (idMatches.length > 0) {
        console.log(`[Citizen ID Extraction] Found ${idMatches.length} ID patterns in document`);
        
        // Get content around the first ID match
        const firstMatch = idMatches[0];
        const contextBuffer = 5000; // 5KB buffer around ID
        const startPos = Math.max(0, firstMatch.index - contextBuffer);
        const endPos = Math.min(content.length, firstMatch.index + contextBuffer);
        
        let citizenContent = content.substring(startPos, endPos);
        
        if (citizenContent.length > maxLength) {
          citizenContent = citizenContent.substring(0, maxLength);
        }
        
        console.log(`[Citizen ID Extraction] Using content around ID patterns: ${citizenContent.length} chars`);
        return citizenContent;
      }
    }
    
    // Fallback for non-service express or if no specific patterns found
    console.log(`[Citizen ID Extraction] Using standard extraction (last portion of document)`);
    const startFromEnd = Math.max(0, content.length - maxLength);
    return content.substring(startFromEnd);
  }

  // Extract signature-related content intelligently
  extractSignatureContent(content, maxLength) {
    console.log(`[Signature Extraction] Starting with content length: ${content.length}`);
    
    // For signatures, prioritize the END of the document where signatures typically appear
    // Look for actual signature patterns rather than just keywords
    const actualSignaturePatterns = [
      /ลงชื่อ.*(?:\n|\r\n).*(?:\(.*\))/g,  // ลงชื่อ followed by name in parentheses
      /พยาน.*(?:\n|\r\n).*(?:\(.*\))/g,     // พยาน followed by name in parentheses
      /โดย.*(?:\n|\r\n).*(?:\(.*\))/g,      // โดย followed by name in parentheses
      /ผู้ให้เช่า.*(?:\n|\r\n).*(?:\(.*\))/g // ผู้ให้เช่า (lessor) followed by name in parentheses
    ];
    
    const signatureMatches = [];
    actualSignaturePatterns.forEach(pattern => {
      const matches = [...content.matchAll(pattern)];
      matches.forEach(match => {
        signatureMatches.push({
          position: match.index,
          text: match[0],
          pattern: pattern.source
        });
      });
    });
    
    console.log(`[Signature Extraction] Found ${signatureMatches.length} actual signature patterns`);
    
    if (signatureMatches.length > 0) {
      // Use content around actual signature patterns
      signatureMatches.sort((a, b) => a.position - b.position);
      const firstSig = signatureMatches[0].position;
      const lastSig = signatureMatches[signatureMatches.length - 1].position;
      
      const contextBuffer = 3000; // Larger buffer for signatures
      const startPos = Math.max(0, firstSig - contextBuffer);
      const endPos = Math.min(content.length, lastSig + contextBuffer);
      
      let signatureContent = content.substring(startPos, endPos);
      console.log(`[Signature Extraction] Using signature pattern range: ${startPos} to ${endPos}`);
      
      if (signatureContent.length > maxLength) {
        signatureContent = signatureContent.substring(0, maxLength);
      }
      
      return signatureContent;
    }
    
    // Fallback: Use the last portion of the document (where signatures typically are)
    console.log('[Signature Extraction] No signature patterns found, using last portion of document');
    const startFromEnd = Math.max(0, content.length - maxLength);
    let signatureContent = content.substring(startFromEnd);
    
    // Look for page markers to include final pages
    const pagePattern = /Page \d+/g;
    const pages = content.match(pagePattern);
    
    if (pages && pages.length > 3) {
      // Try to include last 3-4 pages which typically contain signatures
      const lastFewPagesPattern = new RegExp(`Page ${pages.length - 3}[\\s\\S]*$`);
      const lastPagesMatch = content.match(lastFewPagesPattern);
      
      if (lastPagesMatch && lastPagesMatch[0].length <= maxLength) {
        signatureContent = lastPagesMatch[0];
        console.log(`[Signature Extraction] Using last 3 pages from Page ${pages.length - 3}`);
      }
    }
    
    console.log(`[Sequential] Signature content extracted: ${signatureContent.length} chars with ${signatureMatches.length} actual signature patterns found`);
    
    // === DETAILED SIGNATURE EXTRACTION LOGGING ===
    console.log(`\n${'='.repeat(100)}`);
    console.log(`[SIGNATURE EXTRACTION] Found ${signatureMatches.length} actual signature patterns`);
    if (signatureMatches.length > 0) {
      console.log(`[SIGNATURE EXTRACTION] Pattern matches:`);
      signatureMatches.forEach((match, i) => {
        console.log(`  ${i + 1}. Position ${match.position}: "${match.text.substring(0, 50)}..."`);
      });
    }
    console.log(`[SIGNATURE EXTRACTION] Final content length: ${signatureContent.length} chars`);
    console.log(`\n--- SIGNATURE CONTENT EXTRACTED ---`);
    console.log(signatureContent);
    console.log(`${'='.repeat(100)}\n`);
    
    return signatureContent;
  }

  // Clean Lotus LLM JSON response
  cleanLotusJson(raw) {
    try {
      if (!raw) return '{}';
  
      let cleaned = raw.trim();
  
      // Remove Markdown triple backticks and optional 'json' hint
      cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```$/g, '');
  
      // Remove invalid control characters
      cleaned = cleaned.replace(/[\u0000-\u001F\u007F]/g, '');
  
      // Normalize smart quotes to standard quotes
      cleaned = cleaned.replace(/[""]/g, '"').replace(/['']/g, "'");
  
      // Escape lone backslashes (those not followed by escape characters)
      cleaned = cleaned.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
  
      // Remove trailing commas before closing braces/brackets
      cleaned = cleaned.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
  
      return cleaned;
    } catch (err) {
      console.error('[cleanLotusJson] ERROR:', err.message);
      return raw;
    }
  }

  // Legacy method for backward compatibility
  async processLegacy(content, contractType, sourceType = 'pdf') {
    console.log(`[Sequential] Using legacy processing for ${contractType}`);
    
    const prompt = this.promptManager.createLegacyExtractionPrompt(contractType, sourceType);
    const finalPrompt = `${prompt}\n\nContent:\n${content}`;
    
    const responseText = await this.callLotusWithRetry(finalPrompt);
    const withoutThinkTags = stripThinkTags(responseText);
    return this.cleanLotusJson(withoutThinkTags);
  }
}

export default SequentialProcessor;