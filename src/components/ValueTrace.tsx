import React from 'react';

interface ValueTraceProps {
  displayValue: React.ReactNode;
  source: string;
  calculation: string;
  className?: string;
}

export const ValueTrace: React.FC<ValueTraceProps> = ({
  displayValue,
  source,
  calculation,
  className = '',
}) => {
  const tooltip = `Origem: ${source}\nCálculo: ${calculation}`;
  return (
    <span className={className} title={tooltip}>
      {displayValue}
    </span>
  );
};

