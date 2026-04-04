import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, X, Layers } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { message } from '../ui';
import { sanitizeSVG } from '../../utils/sanitize';
import {
  WEIGHT_LEVELS,
  SCALE_LEVELS,
  REGULAR_INDEX,
  MEDIUM_SCALE_INDEX,
  TOTAL_VARIANTS,
  buildVariantName,
  allVariantCombinations,
  injectWeightFilter,
  applyScaleTransform,
} from '../../utils/svg/variants';
import { bakeSvgVariant, buildVariantMeta } from '../../utils/svg/bake';
import db from '../../database';
import useAppStore from '../../store';

interface VariantPanelProps {
  iconId: string;
  iconName: string;
  iconContent: string;
  isVariant: boolean;
}

export default function VariantPanel({
  iconId,
  iconName,
  iconContent,
  isVariant,
}: VariantPanelProps) {
  const { t } = useTranslation();
  const syncLeft = useAppStore((s: any) => s.syncLeft);
  const syncIconContent = useAppStore((s: any) => s.syncIconContent);
  const patchIconContent = useAppStore((s: any) => s.patchIconContent);
  const variantProgress = useAppStore((s: any) => s.variantProgress);
  const setVariantProgress = useAppStore((s: any) => s.setVariantProgress);

  const [expanded, setExpanded] = useState(false);
  const [weightIndex, setWeightIndex] = useState(REGULAR_INDEX);
  const [scaleIndex, setScaleIndex] = useState(MEDIUM_SCALE_INDEX);
  const [generating, setGenerating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Existing variants for this icon
  const [variants, setVariants] = useState<any[]>([]);
  const refreshVariants = useCallback(() => {
    setVariants(db.getVariants(iconId));
  }, [iconId]);

  useEffect(() => {
    if (expanded) refreshVariants();
  }, [expanded, iconId, refreshVariants]);

  const currentWeight = WEIGHT_LEVELS[weightIndex];
  const currentScale = SCALE_LEVELS[scaleIndex];
  const isOriginal = weightIndex === REGULAR_INDEX && scaleIndex === MEDIUM_SCALE_INDEX;
  const alreadyExists = useMemo(
    () => db.hasVariant(iconId, currentWeight.key, currentScale.key),
    [iconId, currentWeight.key, currentScale.key, variants]
  );

  // Real-time preview via feMorphology injection (debounced)
  useEffect(() => {
    if (!expanded || isVariant) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (isOriginal) {
        patchIconContent(iconId, null); // restore original
        return;
      }
      let preview = injectWeightFilter(iconContent, currentWeight);
      preview = applyScaleTransform(preview, currentScale);
      patchIconContent(iconId, preview);
    }, 50);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [weightIndex, scaleIndex, expanded, iconContent, iconId, isVariant, isOriginal]);

  // Restore original when panel collapses or icon changes
  useEffect(() => {
    return () => {
      patchIconContent(iconId, null);
    };
  }, [iconId]);

  // Generate single variant
  const handleGenerateCurrent = useCallback(async () => {
    if (isOriginal || alreadyExists || generating) return;
    setGenerating(true);
    try {
      const bakedSvg = await bakeSvgVariant(iconContent, currentWeight, currentScale);
      const name = buildVariantName(iconName, currentWeight, currentScale);
      const meta = buildVariantMeta(currentWeight, currentScale);
      db.addVariant(iconId, bakedSvg, name, meta);
      message.success(t('variant.generated', { count: 1 }));
      refreshVariants();
      syncLeft();
    } catch (err: any) {
      if (err.message === 'PUA_EXHAUSTED') {
        message.error(t('variant.codeExhausted'));
      } else {
        message.error(err.message || String(err));
      }
    } finally {
      setGenerating(false);
    }
  }, [
    iconId,
    iconName,
    iconContent,
    currentWeight,
    currentScale,
    isOriginal,
    alreadyExists,
    generating,
  ]);

  // Generate all variants
  const handleGenerateAll = useCallback(async () => {
    if (generating) return;
    const combos = allVariantCombinations().filter(
      ({ weight, scale }) => !db.hasVariant(iconId, weight.key, scale.key)
    );
    if (combos.length === 0) {
      message.info(t('variant.alreadyGenerated'));
      return;
    }

    setGenerating(true);
    setVariantProgress({ current: 0, total: combos.length, active: true });
    let done = 0;
    let failed = 0;

    for (const { weight, scale } of combos) {
      if (!useAppStore.getState().variantProgress?.active) {
        message.info(t('variant.cancelled', { done, total: combos.length }));
        break;
      }
      try {
        const bakedSvg = await bakeSvgVariant(iconContent, weight, scale);
        const name = buildVariantName(iconName, weight, scale);
        const meta = buildVariantMeta(weight, scale);
        db.addVariant(iconId, bakedSvg, name, meta);
        done++;
      } catch {
        failed++;
      }
      setVariantProgress({ current: done + failed, total: combos.length, active: true });
    }

    setVariantProgress(null);
    setGenerating(false);
    refreshVariants();
    syncLeft();

    if (failed > 0) {
      message.warning(t('variant.batchFailed', { failed, total: combos.length }));
    } else {
      message.success(t('variant.generated', { count: done }));
    }
  }, [iconId, iconName, iconContent, generating]);

  // Cancel generation
  const handleCancel = useCallback(() => {
    setVariantProgress((prev: any) => (prev ? { ...prev, active: false } : null));
  }, []);

  // Delete a variant
  const handleDeleteVariant = useCallback(
    (variantId: string) => {
      db.delIcon(variantId);
      refreshVariants();
      syncLeft();
    },
    [refreshVariants]
  );

  // Variant is selected — show disabled state
  if (isVariant) {
    return (
      <div className="mb-4 opacity-60">
        <h4
          className={cn(
            'text-xs font-semibold uppercase tracking-wider',
            'text-foreground-muted mb-2 pb-1.5 border-b border-border'
          )}
        >
          <Layers size={12} className="inline mr-1.5" />
          {t('variant.title')}
        </h4>
        <p className="text-xs text-foreground-muted italic">{t('variant.cannotNest')}</p>
      </div>
    );
  }

  return (
    <div className="mb-4">
      {/* Header — collapsible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'w-full flex items-center justify-between',
          'text-xs font-semibold uppercase tracking-wider',
          'text-foreground-muted mb-2 pb-1.5 border-b border-border',
          'hover:text-foreground transition-colors cursor-pointer'
        )}
      >
        <span>
          {expanded ? (
            <ChevronDown size={12} className="inline mr-1" />
          ) : (
            <ChevronRight size={12} className="inline mr-1" />
          )}
          {t('variant.title')}
        </span>
        <span className="text-[10px] font-normal">
          {variants.length}/{TOTAL_VARIANTS}
        </span>
      </button>

      {expanded && (
        <div className="space-y-3">
          {/* Weight slider */}
          <div>
            <label className="text-xs text-foreground-muted mb-1 block">
              {t('variant.weight')}
            </label>
            <input
              type="range"
              min={0}
              max={WEIGHT_LEVELS.length - 1}
              value={weightIndex}
              onChange={(e) => setWeightIndex(Number(e.target.value))}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-[9px] text-foreground-muted mt-0.5">
              {WEIGHT_LEVELS.map((w, i) => (
                <span key={w.key} className={cn(i === weightIndex && 'text-accent font-bold')}>
                  {t(`variant.weight.${w.key}`).slice(0, 2)}
                </span>
              ))}
            </div>
          </div>

          {/* Scale toggle */}
          <div>
            <label className="text-xs text-foreground-muted mb-1 block">{t('variant.scale')}</label>
            <div className="flex gap-1">
              {SCALE_LEVELS.map((s, i) => (
                <button
                  key={s.key}
                  onClick={() => setScaleIndex(i)}
                  className={cn(
                    'flex-1 py-1 text-xs rounded-md border transition-colors',
                    i === scaleIndex
                      ? 'bg-accent text-accent-foreground border-accent'
                      : 'bg-surface text-foreground border-border hover:border-accent'
                  )}
                >
                  {t(`variant.scale.${s.key}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Preview comparison */}
          <div className="flex gap-2">
            <div className="flex-1 aspect-square rounded-lg bg-surface-muted border border-border flex items-center justify-center p-2">
              <div
                className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                dangerouslySetInnerHTML={{ __html: sanitizeSVG(iconContent) }}
              />
            </div>
            <div className="flex-1 aspect-square rounded-lg bg-surface-muted border border-border flex items-center justify-center p-2">
              <div
                className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                dangerouslySetInnerHTML={{
                  __html: sanitizeSVG(
                    isOriginal
                      ? iconContent
                      : applyScaleTransform(
                          injectWeightFilter(iconContent, currentWeight),
                          currentScale
                        )
                  ),
                }}
              />
            </div>
          </div>
          <div className="flex justify-between text-[9px] text-foreground-muted">
            <span>{t('variant.weight.regular')}</span>
            <span>
              {isOriginal ? t('variant.weight.regular') : t(`variant.weight.${currentWeight.key}`)}
              {currentScale.key !== 'medium' ? ` · ${t(`variant.scale.${currentScale.key}`)}` : ''}
            </span>
          </div>

          {/* Generate buttons */}
          <div className="flex gap-2">
            <Button
              size="small"
              type={isOriginal || alreadyExists ? 'default' : 'primary'}
              disabled={isOriginal || alreadyExists || generating}
              onClick={handleGenerateCurrent}
              className="flex-1"
            >
              {alreadyExists ? t('variant.alreadyGenerated') : t('variant.generateCurrent')}
            </Button>
            <Button
              size="small"
              disabled={generating}
              onClick={handleGenerateAll}
              className="flex-1"
            >
              {t('variant.generateAll', { count: TOTAL_VARIANTS - variants.length })}
            </Button>
          </div>

          {/* Progress bar */}
          {variantProgress && (
            <div>
              <div className="flex justify-between text-[10px] text-foreground-muted mb-1">
                <span>
                  {t('variant.progress', {
                    current: variantProgress.current,
                    total: variantProgress.total,
                  })}
                </span>
                <button onClick={handleCancel} className="text-danger hover:underline">
                  {t('common.cancel')}
                </button>
              </div>
              <div className="w-full bg-surface-muted rounded-full h-1.5">
                <div
                  className="bg-accent h-1.5 rounded-full transition-all duration-200"
                  style={{ width: `${(variantProgress.current / variantProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Generated variants list */}
          {variants.length > 0 && (
            <div className="space-y-0.5 max-h-32 overflow-y-auto">
              {variants.map((v: any) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between px-2 py-1 rounded text-xs hover:bg-surface-muted group"
                >
                  <span className="text-foreground truncate">{v.iconName}</span>
                  <button
                    onClick={() => handleDeleteVariant(v.id)}
                    className="opacity-0 group-hover:opacity-100 text-foreground-muted hover:text-danger transition-opacity"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
