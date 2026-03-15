// React
import React, { useRef, useEffect } from 'react';
// Antd
import { Input, Button } from 'antd';
import type { InputRef, InputProps } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
// Components
import EnhanceBadge from '../badge';
// Utils
import { cn } from '../../../lib/utils';

interface EnhanceInputProps extends Omit<InputProps, 'autoFocus'> {
  autoFocus?: boolean;
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
  });

  return (
    <div>
      <p className="mb-1.5 text-sm text-foreground dark:text-foreground">{inputTitle}</p>
      <div className="relative">
        <Input ref={inputRef} {...inputProps} />
        {inputSave && (
          <Button
            className={cn(
              '!absolute !top-0 !right-0 !z-10',
              '!border-none',
              '!bg-transparent hover:!bg-transparent active:!bg-transparent',
              '!text-brand-500 dark:!text-brand-400',
              '[&_i]:!mr-auto'
            )}
            shape="circle"
            icon={<SaveOutlined />}
            onClick={inputSaveClick}
          />
        )}
      </div>
      <EnhanceBadge status={inputHintBadgeType} text={inputHintText} />
    </div>
  );
}

export default EnhanceInput;
