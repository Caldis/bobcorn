// React
import React, { useRef, useEffect } from 'react';
// UI
import { Input, Button } from '../../ui';
import type { InputRef } from '../../ui/input';
import { Save } from 'lucide-react';
// Components
import EnhanceBadge from '../badge';
// Utils
import { cn } from '../../../lib/utils';

interface EnhanceInputProps {
  autoFocus?: boolean;
  value?: string | null;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPressEnter?: () => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  inputTitle?: string;
  inputHintBadgeType?: 'success' | 'processing' | 'default' | 'error' | 'warning';
  inputHintText?: string | null;
  inputSave?: boolean;
  inputSaveClick?: () => void;
}

function EnhanceInput({
  autoFocus = true,
  inputTitle = '',
  inputHintBadgeType = 'error',
  inputHintText = '',
  inputSave = false,
  inputSaveClick = () => {},
  ...inputProps
}: EnhanceInputProps) {
  const inputRef = useRef<InputRef>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  return (
    <div>
      <p className="mb-1.5 text-sm text-foreground">{inputTitle}</p>
      <div className="relative">
        <Input ref={inputRef} {...inputProps} />
        {inputSave && (
          <Button
            className={cn(
              '!absolute !top-0 !right-0 !z-10',
              '!border-none',
              '!bg-transparent hover:!bg-transparent active:!bg-transparent',
              '!text-accent',
              '[&_i]:!mr-auto'
            )}
            shape="circle"
            icon={<Save size={14} />}
            onClick={inputSaveClick}
          />
        )}
      </div>
      <EnhanceBadge status={inputHintBadgeType} text={inputHintText} />
    </div>
  );
}

export default EnhanceInput;
