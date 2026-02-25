Step 1: Database — receipt_contents table                                    
                                                                              
 Create: app/db/schema.ts — add receiptContents table after receipts          
 - id (uuid PK), receiptId (FK to receipts, unique), rawText (text),          
 storeName (text, nullable)                                                   
 - items (text — JSON string of {name, quantity, unitPrice, totalPrice}[])    
 - totalAmount (decimal 10,2, nullable), currency (text, default "EUR")       
 - purchaseDate (timestamp, nullable), aiModel (text, nullable)               
 - createdAt, updatedAt                                                       
                                                                              
 Modify: app/db/adapters/types.ts — add to DatabaseAdapter:                   
 - getReceiptContentByReceiptId(receiptId: string)                            
 - createReceiptContent(content: NewReceiptContent)                           
 - deleteReceiptContent(id: string)                                           
                                                                              
 Modify: app/db/adapters/postgres.ts (and neon.ts if exists) — implement      
 above methods                                                                
                                                                              
 Run: Drizzle migration (npx drizzle-kit generate + npx drizzle-kit push)     
                                                                              
 Step 2: Settings key + Permission                                            
                                                                              
 Modify: app/lib/openrouter.server.ts — add RECEIPT_AI_MODEL:                 
 "receipt_ai_model" to SETTINGS_KEYS                                          
                                                                              
 Modify: app/lib/permissions.ts — add after settings:faqs:                    
 "settings:receipts": { translationKey: "permissions.settings.receipts",      
 category: "Settings" },                                                      
                                                                              
 Step 3: Google Vision API integration                                        
                                                                              
 Create: app/lib/google-vision.server.ts                                      
 - extractTextFromImage(imageBase64: string, mimeType: string):               
 Promise<string | null>                                                       
 - Uses GOOGLE_API_KEY env var, calls                                         
 https://vision.googleapis.com/v1/images:annotate with TEXT_DETECTION         
 - Only supports images (jpg, png, webp) — NOT PDFs                           
                                                                              
 Step 4: OCR + AI parsing orchestration                                       
                                                                              
 Create: app/lib/receipt-ocr.server.ts                                        
 - processReceiptOCR(receiptUrl: string, receiptId: string) — full pipeline:  
   a. Fetch image via storage.getReceiptContentBase64(receiptUrl) (already    
 exists)                                                                      
   b. Call Google Vision OCR → raw text                                       
   c. Get API key + model from db.getSetting(RECEIPT_AI_MODEL)                
   d. Call OpenRouter AI with prompt to parse receipt text → structured JSON  
   e. Save to receipt_contents table                                          
   f. Return { success, rawText, data: { storeName, items[], totalAmount,     
 currency, purchaseDate } }                                                   
 - Graceful degradation: if no AI model configured, saves raw text only with  
 empty items                                                                  
                                                                              
 AI prompt extracts: store name, line items (name/qty/unitPrice/totalPrice),  
 total, currency (default EUR), date                                          
                                                                              
 Step 5: API endpoint                                                         
                                                                              
 Create: app/routes/api.receipts.ocr.tsx                                      
 - POST action: requires treasury:receipts:write (or                          
 transactions/reimbursements write)                                           
 - Accepts receiptId + receiptUrl in FormData                                 
 - Calls processReceiptOCR(), returns JSON result                             
                                                                              
 Modify: app/routes.ts — add:                                                 
 - route("api/receipts/ocr", "routes/api.receipts.ocr.tsx")                   
 - route("settings/receipts", "routes/settings.receipts.tsx")                 
                                                                              
 Step 6: Settings page — settings/receipts                                    
                                                                              
 Create: app/routes/settings.receipts.tsx — follow settings.analytics.tsx     
 pattern                                                                      
 - Loader: check settings:receipts permission, fetch API key + receipt model  
 + available models                                                           
 - Also check process.env.GOOGLE_API_KEY existence                            
 - Action: handle save-receipt-settings intent                                
                                                                              
 Create: app/components/settings/receipt-ocr-settings.tsx                     
 - Card with AI model selector (reuse existing model selector pattern)        
 - Show <MissingApiKeyWarning> if no OpenRouter API key                       
 - Show warning if no GOOGLE_API_KEY env var                                  
                                                                              
 Create: app/components/settings/receipt-ocr-settings.server.ts               
 - handleReceiptOcrSettingsAction(db, formData) — saves RECEIPT_AI_MODEL      
                                                                              
 Modify: app/components/navigation.tsx — add settings link after              
 settings:faqs block (~line 443):                                             
 {hasPermission("settings:receipts") && renderMenuLink("/settings/receipts",  
 "receipt_long", t("settings.receipts.title"), pathname ===                   
 "/settings/receipts", showLabels, onNavigate)}                               
                                                                              
 Step 7: OCR checkbox on treasury/receipts/new                                
                                                                              
 Modify: app/routes/treasury.receipts.new.tsx                                 
 - Loader: add hasOcrSupport flag (true if GOOGLE_API_KEY exists)             
 - Component: add Checkbox below FileUpload: "Read receipt contents (OCR)" —  
 shown only when hasOcrSupport + file is image type                           
 - Action: after db.createReceipt(), if runOcr === "on", call                 
 processReceiptOCR(blobUrl, receipt.id), redirect to receipt detail page with 
  OCR data                                                                    
                                                                              
 Step 8: OCR in receipt picker (reimbursement/transaction forms)              
                                                                              
 Modify: app/components/treasury/receipt-picker.tsx                           
 - Add optional ocrEnabled prop + onOcrComplete callback prop                 
 - Add checkbox in upload section: "Run OCR on uploaded receipt"              
 - After successful upload + OCR checked, call fetch("/api/receipts/ocr") →   
 pass result to onOcrComplete                                                 
                                                                              
 Modify: app/components/treasury/reimbursement-form.tsx                       
 - Pass ocrEnabled to ReceiptPicker                                           
 - Handle onOcrComplete to surface parsed data to parent form                 
                                                                              
 Parent forms (treasury.transactions.new.tsx, treasury.reimbursement.new.tsx) 
  can use parsed data to pre-fill amount, description, date.                  
                                                                              
 Step 9: Receipt contents display component                                   
                                                                              
 Create: app/components/treasury/receipt-contents-display.tsx                 
 - Shows store name, items table (name/qty/price), total, date                
 - Collapsible "Raw OCR Text" section                                         
 - Optional "Use this data" button that triggers pre-fill callback            
                                                                              
 Modify: app/routes/treasury.receipts.$receiptId.tsx — if receipt_contents    
 exists for this receipt, display it using the new component                  
                                                                              
 Step 10: Translations                                                        
                                                                              
 Modify: public/locales/fi/common.json and public/locales/en/common.json      
 - settings.receipts.* keys (title, descriptions, warnings)                   
 - treasury.receipts.ocr.* keys (run_ocr, processing, success, error, labels) 
 - permissions.settings.receipts translation                                  
                                                                              
 ---                                                                          
 Files Summary                                                                
                                                                              
 New files (8):                                                               
                                                                              
 1. app/lib/google-vision.server.ts — Vision API integration                  
 2. app/lib/receipt-ocr.server.ts — OCR + AI pipeline                         
 3. app/routes/api.receipts.ocr.tsx — API endpoint                            
 4. app/routes/settings.receipts.tsx — Settings page                          
 5. app/components/settings/receipt-ocr-settings.tsx — Settings UI            
 6. app/components/settings/receipt-ocr-settings.server.ts — Settings handler 
 7. app/components/treasury/receipt-contents-display.tsx — Display component  
 8. Drizzle migration file (auto-generated)                                   
                                                                              
 Modified files (11):                                                         
                                                                              
 1. app/db/schema.ts — receipt_contents table                                 
 2. app/db/adapters/types.ts — DB interface methods                           
 3. app/db/adapters/postgres.ts — DB implementation                           
 4. app/lib/openrouter.server.ts — RECEIPT_AI_MODEL key                       
 5. app/lib/permissions.ts — settings:receipts permission                     
 6. app/routes.ts — new routes                                                
 7. app/routes/treasury.receipts.new.tsx — OCR checkbox                       
 8. app/routes/treasury.receipts.$receiptId.tsx — show parsed data            
 9. app/components/treasury/receipt-picker.tsx — OCR in picker                
 10. app/components/navigation.tsx — settings nav link                        
 11. public/locales/{fi,en}/common.json — translations                        
                                                                              
 Verification                                                                 
                                                                              
 1. Create receipt via treasury/receipts/new with OCR checkbox → confirm OCR  
 text + parsed data saved                                                     
 2. Check settings/receipts page → select AI model, verify save               
 3. Upload receipt via receipt picker in reimbursement form with OCR →        
 confirm pre-fill                                                             
 4. View receipt detail page → confirm parsed contents displayed              
 5. Test with no GOOGLE_API_KEY → OCR checkbox should be hidden               
 6. Test with no OpenRouter key → raw text saved, no AI parsing               
