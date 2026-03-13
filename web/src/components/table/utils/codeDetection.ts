import detectLang from "lang-detector";

export interface CodeDetectionResult {
  isCode: boolean;
  language?: string;
  confidence?: number;
  mode?: string; // CodeMirror mode
}

export function detectCodeInValue(value: unknown): CodeDetectionResult {
  // Only process strings
  if (typeof value !== "string") {
    return { isCode: false };
  }

  const trimmed = value.trim();

  // Skip detection for very short strings - lang-detector struggles with these
  // and they're unlikely to be meaningful code anyway
  if (trimmed.length < 20) {
    return { isCode: false };
  }

  // Skip detection for very long strings to avoid performance issues
  if (trimmed.length > 10000) {
    return { isCode: false };
  }

  // Check for basic code patterns before running lang-detector
  const hasCodePatterns =
    /[{}();=]/.test(trimmed) ||
    /\b(SELECT|FROM|WHERE|function|def|class|import|return|if|for|while)\b/i.test(
      trimmed,
    );

  if (!hasCodePatterns) {
    return { isCode: false };
  }

  // Run lang-detector only if we passed all filters
  try {
    const result = detectLang(trimmed, { statistics: true });

    // Get the detected language and its points
    const detectedLanguage = result.detected;
    const detectedPoints = result.statistics[detectedLanguage] || 0;

    // Skip if detected as "Unknown"
    if (detectedLanguage === "Unknown") {
      return { isCode: false };
    }

    // Convert points to a rough confidence score (normalize based on typical ranges)
    // Typical good matches have 2-5+ points, so we'll use a threshold of 2+ points
    // For longer strings (>1000 chars), use a lower threshold as they're more likely to be code files
    const confidence = Math.min(detectedPoints / 5, 1.0); // Cap at 1.0
    const threshold = trimmed.length > 1000 ? 1 : 2; // Lower threshold for longer content
    const isCode = detectedPoints >= threshold;

    return {
      isCode,
      language: detectedLanguage,
      confidence,
      mode: detectedLanguage.toLowerCase(), // Simple mapping: 'JavaScript' → 'javascript'
    };
  } catch (_error) {
    // Fallback if lang-detector fails
    return { isCode: false };
  }
}
