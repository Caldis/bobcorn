import React, { useState } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '../../lib/utils';

interface SliderProps {
  defaultValue?: number;
  min?: number;
  max?: number;
  onChange?: (value: number) => void;
  tooltip?: {
    formatter?: (value?: number) => string;
  };
  className?: string;
}

export function Slider({
  defaultValue = 50,
  min = 0,
  max = 100,
  onChange,
  tooltip,
  className,
}: SliderProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [currentValue, setCurrentValue] = useState(defaultValue);

  const handleValueChange = (values: number[]) => {
    const val = values[0];
    setCurrentValue(val);
    onChange?.(val);
  };

  const tipText = tooltip?.formatter?.(currentValue) ?? `${currentValue}`;

  return (
    <div className={cn('relative px-2', className)}>
      <SliderPrimitive.Root
        defaultValue={[defaultValue]}
        min={min}
        max={max}
        step={1}
        onValueChange={handleValueChange}
        className="relative flex w-full touch-none select-none items-center h-5"
        onPointerDown={() => setShowTooltip(true)}
        onPointerUp={() => setShowTooltip(false)}
      >
        <SliderPrimitive.Track className="relative h-1 w-full grow rounded-full bg-surface-accent dark:bg-white/10">
          <SliderPrimitive.Range className="absolute h-full rounded-full bg-brand-500" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          className={cn(
            'block h-4 w-4 rounded-full',
            'border-2 border-brand-500 bg-surface',
            'shadow-sm',
            'transition-colors duration-150',
            'hover:border-brand-600',
            'focus:outline-none focus:ring-2 focus:ring-ring/40'
          )}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          {showTooltip && (
            <div
              className={cn(
                'absolute -top-8 left-1/2 -translate-x-1/2',
                'px-2 py-0.5 rounded text-xs',
                'bg-foreground text-surface',
                'whitespace-nowrap pointer-events-none'
              )}
            >
              {tipText}
            </div>
          )}
        </SliderPrimitive.Thumb>
      </SliderPrimitive.Root>
    </div>
  );
}

export default Slider;
