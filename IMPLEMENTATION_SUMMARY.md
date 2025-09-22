# Remote Dataset Run Headers Implementation Summary

This document summarizes the implementation of optional key:value headers for remote dataset run configurations with **encrypted secret storage**, as requested in Linear issue LFE-6610.

## 🔒 **UPDATED IMPLEMENTATION WITH ENCRYPTION**

Following feedback to implement secret header encryption consistent with webhook and LLM connection patterns, the implementation has been completely redesigned to match the existing security model.

## Changes Made

### 1. Database Schema Updates
- **File**: `packages/shared/prisma/schema.prisma`
- **Changes**: 
  - Added `remoteExperimentRequestHeaders Json? @map("remote_experiment_request_headers")` - stores encrypted headers
  - Added `remoteExperimentDisplayHeaders Json? @map("remote_experiment_display_headers")` - stores masked headers for UI display
- **Purpose**: Separate encrypted storage from display values, following webhook pattern

### 2. Backend API Updates
- **File**: `web/src/features/datasets/server/dataset-router.ts`

#### **Imports Added**:
```typescript
import {
  encryptSecretHeaders,
  createDisplayHeaders, 
  decryptSecretHeaders,
} from "@langfuse/shared/src/server";
```

#### **`upsertRemoteExperiment` endpoint**:
- Updated input schema to accept `requestHeaders: Record<string, { secret: boolean; value: string }>`
- Process headers with encryption: `encryptSecretHeaders(input.requestHeaders)`
- Generate display headers with masking: `createDisplayHeaders(input.requestHeaders)`
- Store both encrypted and display versions in database

#### **`getRemoteExperiment` endpoint**:
- Returns `displayHeaders` for UI consumption (with masked secret values)
- Secret values show as `****...****` pattern

#### **`triggerRemoteExperiment` endpoint**:
- Selects `remoteExperimentRequestHeaders` (encrypted)
- Decrypts headers before HTTP request: `decryptSecretHeaders(requestHeaders)`
- Applies decrypted headers to outbound webhook

### 3. Frontend Form Updates
- **File**: `web/src/features/experiments/components/RemoteExperimentUpsertForm.tsx`

#### **Complete UI Redesign**:
- **Schema**: Updated to match webhook form pattern with header arrays
- **Icons**: Added `Lock`, `LockOpen`, `Plus`, `X` icons for header management
- **useFieldArray**: Dynamic header management with add/remove functionality
- **Secret Toggle**: Lock icon to mark headers as secret (encrypted)
- **Display Logic**: Shows masked values for secret headers, plain text for public headers

#### **Header Management Features**:
```typescript
// Add new header
const addHeader = () => {
  appendHeader({
    name: "",
    value: "",
    displayValue: "",
    isSecret: false,
    wasSecret: false,
  });
};

// Toggle secret status
const toggleHeaderSecret = (index: number) => {
  const currentValue = form.watch(`headers.${index}.isSecret`);
  form.setValue(`headers.${index}.isSecret`, !currentValue);
};
```

#### **Form Processing**:
- Converts UI header array to backend `requestHeaders` format
- Handles secret/non-secret headers appropriately
- Validates header names and values

### 4. Component Interface Updates
- **File**: `web/src/features/experiments/components/RemoteExperimentTriggerModal.tsx`
- **Change**: Updated interface to use `displayHeaders` instead of plain headers

## 🚀 **Features Implemented**

### ✅ **Encrypted Secret Storage**
- Secret headers are encrypted using the same encryption system as webhooks and LLM connections
- Uses `ENCRYPTION_KEY` environment variable for encryption/decryption
- Secret values are never stored in plaintext in the database

### ✅ **Webhook-Style UI Experience**
- **Multiple Headers**: Users can add multiple header key/value pairs
- **Secret Toggle**: Lock icon to mark headers as secret (🔒 orange lock when secret, 🔓 gray when public)
- **Masked Display**: Secret headers show `****...****` pattern in UI
- **Dynamic Management**: Add/remove headers with `+` and `×` buttons
- **Grid Layout**: Clean 4-column layout: [Name] [Value] [Secret Toggle] [Remove]

### ✅ **Security Features**
- **Encryption at Rest**: Secret headers encrypted in database
- **Masked UI**: Secret values hidden in form fields
- **Secure Transmission**: Headers decrypted only when sending HTTP requests
- **Input Validation**: Password-type fields for secret values

### ✅ **Backward Compatibility**
- Existing configurations continue to work unchanged
- Headers are optional - feature works with or without them
- No breaking changes to existing API contracts

## 🔧 **Usage Examples**

### **Authentication Header (Secret)**:
- Header Name: `Authorization`
- Header Value: `Bearer your-api-token`
- Secret: ✅ **Enabled** (🔒)
- **Storage**: Value encrypted in database
- **Display**: Shows as `Bear...oken` in UI

### **API Key Header (Secret)**:
- Header Name: `X-API-Key`
- Header Value: `sk-1234567890abcdef`
- Secret: ✅ **Enabled** (🔒)
- **Storage**: Value encrypted in database
- **Display**: Shows as `sk-1...cdef` in UI

### **Public Header (Non-Secret)**:
- Header Name: `X-App-Version`
- Header Value: `1.0.0`
- Secret: ❌ **Disabled** (🔓)
- **Storage**: Value stored in plaintext
- **Display**: Shows full value `1.0.0`

## 🛠 **Technical Implementation**

### **Data Flow**:
1. **UI Input** → Header array with secret flags
2. **Form Submit** → Convert to `requestHeaders` format
3. **Backend Processing** → Encrypt secret headers, create display headers
4. **Database Storage** → Store encrypted + display versions
5. **UI Display** → Load display headers (masked secrets)
6. **HTTP Request** → Decrypt headers, apply to fetch call

### **Security Architecture**:
- **Encryption**: AES encryption using shared `ENCRYPTION_KEY`
- **Key Management**: Same key system as webhooks/LLM connections
- **Access Control**: Headers only decrypted for HTTP requests
- **UI Security**: Secret values masked in all form inputs

### **Header Processing Pipeline**:
```typescript
// Frontend → Backend
requestHeaders: {
  "Authorization": { secret: true, value: "Bearer token123" },
  "X-Custom": { secret: false, value: "public-value" }
}

// Backend Processing
encryptedHeaders = encryptSecretHeaders(requestHeaders)
displayHeaders = createDisplayHeaders(requestHeaders)

// Database Storage
remoteExperimentRequestHeaders: {
  "Authorization": { secret: true, value: "encrypted_value_here" },
  "X-Custom": { secret: false, value: "public-value" }
}

remoteExperimentDisplayHeaders: {
  "Authorization": { secret: true, value: "Bear...123" },
  "X-Custom": { secret: false, value: "public-value" }
}

// HTTP Request
decryptedHeaders = decryptSecretHeaders(requestHeaders)
// Results in: { "Authorization": "Bearer token123", "X-Custom": "public-value" }
```

## 📁 **Files Modified**

1. **`packages/shared/prisma/schema.prisma`** - Database schema with encrypted storage
2. **`web/src/features/datasets/server/dataset-router.ts`** - Backend API with encryption
3. **`web/src/features/experiments/components/RemoteExperimentUpsertForm.tsx`** - Webhook-style UI
4. **`web/src/features/experiments/components/RemoteExperimentTriggerModal.tsx`** - Interface updates

## 🚀 **Next Steps**

1. **Database Migration**: Run Prisma migration for new encrypted storage columns
2. **Security Testing**: Verify encryption/decryption works correctly
3. **UI Testing**: Test secret toggle, masking, and header management
4. **Documentation**: Update user docs with security information

## 🔐 **Security Notes**

- **Environment**: Requires `ENCRYPTION_KEY` environment variable
- **Consistency**: Uses same encryption system as webhooks and LLM connections
- **Best Practices**: Secret headers are never logged or exposed in plaintext
- **Migration**: Existing plaintext headers (if any) should be migrated to encrypted format

The implementation now provides **enterprise-grade security** for authentication headers while maintaining the intuitive user experience consistent with other Langfuse features.