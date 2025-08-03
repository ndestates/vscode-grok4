# Grok Integration - Cache Management

## Overview

The Grok Integration extension uses an in-memory LRU (Least Recently Used) cache to improve performance and reduce API calls by storing frequently used responses.

## Cache Storage Location

- **Type**: In-memory only (using LRUCache)
- **Persistence**: Cache is lost when VS Code is restarted or extension is reloaded
- **Security**: No sensitive data is cached - API keys and secrets are redacted before caching

## User Settings

All cache settings can be configured in VS Code Settings (`Ctrl/Cmd + ,`) under "Grok Integration":

### `grokIntegration.enableCache`
- **Type**: Boolean
- **Default**: `true`
- **Description**: Enable/disable response caching entirely

### `grokIntegration.cacheMaxItems`
- **Type**: Number
- **Default**: `100`
- **Range**: 10-1000 items
- **Description**: Maximum number of responses to cache in memory
- **Memory Impact**: Higher values use more RAM but provide better cache hit rates

### `grokIntegration.cacheTtlMinutes`
- **Type**: Number  
- **Default**: `30`
- **Range**: 1-1440 minutes (24 hours)
- **Description**: How long cached responses remain valid before expiring
- **Performance Impact**: 
  - Lower values = More fresh responses, more API calls
  - Higher values = Better performance, less fresh responses

## Cache Management Commands

Access these commands via the Command Palette (`Ctrl/Cmd + Shift + P`):

### 🗑️ Grok: Clear Cache
- **Command**: `grok-integration.clearCache`
- **Purpose**: Immediately clear all cached responses
- **Use Case**: Force fresh API calls or free memory

### 📊 Grok: Show Cache Statistics
- **Command**: `grok-integration.showCacheStats`
- **Purpose**: Display current cache usage and settings
- **Shows**: Current items, max capacity, TTL, enabled status

### 🔄 Grok: Reset Cache Settings
- **Command**: `grok-integration.resetCacheSettings`
- **Purpose**: Reset all cache settings to defaults and clear cache
- **Use Case**: Troubleshooting or returning to default configuration

## How Caching Works

1. **Cache Key Generation**: Creates a unique hash based on:
   - Code content (sanitized, secrets redacted)
   - Programming language
   - Action type (explain, review, etc.)

2. **Cache Hit**: If valid cached response exists:
   - Shows "📦 Using cached response" notification
   - Returns cached response immediately
   - No API call made

3. **Cache Miss**: If no valid cached response:
   - Makes API call to Grok
   - Stores response in cache with timestamp
   - Future identical requests will hit cache

4. **Expiration**: Cached entries are automatically removed when:
   - TTL expires (configurable via `cacheTtlMinutes`)
   - Cache reaches max capacity (LRU eviction)
   - Cache is manually cleared

## Performance Benefits

- **Reduced API Calls**: Identical requests use cached responses
- **Faster Response Time**: Instant results for cached queries
- **Cost Savings**: Fewer API calls = lower usage costs
- **Offline-like Experience**: Recently used responses available without network

## Memory Usage

- **Typical Entry Size**: 1-10KB per cached response
- **100 Entries**: ~500KB-5MB memory usage
- **Auto-cleanup**: Old entries automatically removed via LRU eviction

## Privacy & Security

- **No Sensitive Data**: API keys, passwords, and PII are redacted before caching
- **Local Only**: Cache exists only in VS Code's memory
- **No Persistence**: Cache is never written to disk
- **User Control**: Can be completely disabled via settings

## Troubleshooting

### Cache Not Working
1. Check `grokIntegration.enableCache` is `true`
2. Verify you're making identical requests
3. Check if TTL has expired
4. Try clearing cache and making request again

### High Memory Usage
1. Reduce `grokIntegration.cacheMaxItems`
2. Reduce `grokIntegration.cacheTtlMinutes`
3. Periodically clear cache manually

### Stale Responses
1. Reduce `grokIntegration.cacheTtlMinutes`
2. Clear cache manually when needed
3. Disable caching for always-fresh responses

## Configuration Example

```json
{
  "grokIntegration.enableCache": true,
  "grokIntegration.cacheMaxItems": 200,
  "grokIntegration.cacheTtlMinutes": 60,
  "grokIntegration.tokenMultiplier": 1.1
}
```

This configuration provides:
- Caching enabled
- Up to 200 cached responses
- 1 hour cache validity
- Slightly conservative token estimation
