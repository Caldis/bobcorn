#!/bin/bash
echo "=== Security Audit ==="
ISSUES=0
# Unsanitized innerHTML
FOUND=$(grep -rn "dangerouslySetInnerHTML" src/ --include="*.{js,jsx}" | grep -v "sanitizeSVG" | wc -l)
[ "$FOUND" -gt 0 ] && echo "WARN: $FOUND unsanitized dangerouslySetInnerHTML" && ISSUES=$((ISSUES+FOUND))
# eval usage
FOUND=$(grep -rn "eval(" src/ --include="*.{js,jsx}" | wc -l)
[ "$FOUND" -gt 0 ] && echo "WARN: $FOUND eval() usage" && ISSUES=$((ISSUES+FOUND))
# Hardcoded secrets
FOUND=$(grep -rn "password\|secret\|apikey" src/ --include="*.{js,jsx}" -i | grep -v node_modules | wc -l)
[ "$FOUND" -gt 0 ] && echo "WARN: $FOUND potential hardcoded secrets" && ISSUES=$((ISSUES+FOUND))
echo "Total issues: $ISSUES"
exit $ISSUES
