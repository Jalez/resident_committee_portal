# Receipt OCR Setup Guide

This guide explains how to set up receipt OCR (Optical Character Recognition) for both images and PDFs.

## Overview

The system uses two Google Cloud services:
- **Google Vision API** (for images) - Simple API key authentication
- **Google Document AI** (for PDFs) - Uses your existing service account

## Prerequisites

You should already have these set up (required for Google Sheets integration):
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

The same service account is used for PDF OCR.

---

## Image OCR Setup (Google Vision API)

### 1. Get a Google API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (same one as service account)
3. Enable the **Cloud Vision API**
4. Go to **APIs & Services → Credentials**
5. Click **Create Credentials → API Key**
6. Copy the API key

### 2. Add to Environment

```bash
GOOGLE_API_KEY=your_api_key_here
```

**Done!** Image receipts will now work.

---

## PDF OCR Setup (Google Document AI)

PDF support uses your existing service account - just need to set up a processor.

### 1. Enable Document AI

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (same one as service account)
3. Enable the **Document AI API**
4. Go to [Document AI Processors](https://console.cloud.google.com/ai/document-ai/processors)
5. Click **Create Processor**
6. Select **Document OCR** processor type
7. Choose a region (e.g., `us` or `eu`)
8. Click **Create**
9. Copy the **Processor ID** (long string like `abc123def456...`)

### 2. Grant Service Account Access

Your service account needs access to Document AI:

1. Go to **IAM & Admin → IAM**
2. Find your service account email (from `GOOGLE_SERVICE_ACCOUNT_EMAIL`)
3. Click **Edit** (pencil icon)
4. Click **Add Another Role**
5. Select **Document AI API User**
6. Click **Save**

### 3. Add to Environment

```bash
DOCUMENT_AI_LOCATION=us
DOCUMENT_AI_PROCESSOR_ID=abc123def456...
```

**Done!** PDF receipts will now work.

---

## Testing

### Test Image Upload

1. Upload a JPG/PNG receipt
2. Check the console for `[Google Vision]` logs
3. Should extract text successfully

### Test PDF Upload

1. Upload a PDF receipt
2. Check the console for `[Document AI]` logs
3. Should extract text successfully

### Common Issues

**Error: "GOOGLE_API_KEY is required"**
- Add `GOOGLE_API_KEY` to `.env`
- Restart the dev server

**Error: "GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY environment variables are required"**
- These should already be set for Google Sheets integration
- Check your `.env` file

**Error: "Bad image data"**
- This happens when trying to process PDFs with Vision API
- Make sure Document AI is set up correctly
- Restart the dev server after adding `DOCUMENT_AI_*` variables

**Error: "Processor not found"**
- Check that `DOCUMENT_AI_PROCESSOR_ID` is correct
- Verify the processor exists in Google Cloud Console
- Make sure you're in the right project

**Error: "Permission denied"**
- Service account needs "Document AI API User" role
- Follow step 2 above to grant access

**Error: "Could not extract project ID from GOOGLE_SERVICE_ACCOUNT_EMAIL"**
- Check that email format is: `name@project-id.iam.gserviceaccount.com`
- The project ID is extracted automatically from the email

---

## Cost Information

### Google Vision API
- Free tier: 1,000 requests/month
- After: $1.50 per 1,000 images
- [Pricing details](https://cloud.google.com/vision/pricing)

### Google Document AI
- Free tier: 1,000 pages/month
- After: $1.50 per 1,000 pages
- [Pricing details](https://cloud.google.com/document-ai/pricing)

---

## Security Notes

- Keep `GOOGLE_API_KEY` secret
- Service account credentials are already secured in `.env`
- Don't commit credentials to git
- Use environment variables or secret managers
- Rotate keys periodically
