import type { IAttachmentCellValue } from '@teable/core';
import { cn } from '@teable/ui-lib';
import { getFileCover } from '../../editor/attachment';
import type { ICellValue } from '../type';

interface ICellAttachment extends ICellValue<IAttachmentCellValue> {
  itemClassName?: string;
}

export const CellAttachment = (props: ICellAttachment) => {
  const { value, className, style, itemClassName } = props;

  return (
    <div className={cn('flex gap-1 flex-wrap', className)} style={style}>
      {value?.map((attachment) => {
        const { id, name, mimetype, presignedUrl } = attachment;

        return (
          <div
            key={id}
            className={cn(
              'shrink-0 h-7 border rounded border-slate-200 overflow-hidden',
              itemClassName
            )}
          >
            <img
              className="size-full object-contain"
              src={getFileCover(mimetype, presignedUrl)}
              alt={name}
            />
          </div>
        );
      })}
    </div>
  );
};
