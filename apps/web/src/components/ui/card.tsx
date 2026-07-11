import * as React from 'react';
import { cn } from '../../lib/utils';

export function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className, ...rest } = props;
  return <div className={cn('rounded-lg border bg-card p-4 text-card-foreground shadow-sm', className)} {...rest} />;
}
