import type { UseMutateAsyncFunction } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import type { IFilter } from '@teable/core';
import type { ICopyVo, IPasteRo, IRangesRo, ITemporaryPasteRo } from '@teable/openapi';
import { clear, copy, deleteSelection, paste, temporaryPaste } from '@teable/openapi';
import type { CombinedSelection, IRecordIndexMap } from '@teable/sdk';
import { useFields, useSearch, useTableId, useView, useViewId } from '@teable/sdk';
import { useToast } from '@teable/ui-lib';
import type { AxiosResponse } from 'axios';
import { useTranslation } from 'next-i18next';
import { useCallback } from 'react';
import { isHTTPS, isLocalhost } from '@/features/app/utils';
import { tableConfig } from '@/features/i18n/table.config';
import { selectionCoverAttachments } from '../utils';
import {
  ClipboardTypes,
  copyHandler,
  filePasteHandler,
  rangeTypes,
  textPasteHandler,
} from '../utils/copyAndPaste';

export const useSelectionOperation = (props?: {
  filter?: IFilter;
  copyReq?: UseMutateAsyncFunction<AxiosResponse<ICopyVo>, unknown, IRangesRo, unknown>;
}) => {
  const { filter, copyReq } = props || {};
  const tableId = useTableId();
  const viewId = useViewId();
  const fields = useFields();
  const view = useView();
  const { searchQuery: search } = useSearch();

  const { t } = useTranslation(tableConfig.i18nNamespaces);

  const groupBy = view?.group;

  const { mutateAsync: defaultCopyReq } = useMutation({
    mutationFn: (copyRo: IRangesRo) =>
      copy(tableId!, { ...copyRo, viewId, groupBy, filter, search }),
  });

  const { mutateAsync: pasteReq } = useMutation({
    mutationFn: (pasteRo: IPasteRo) =>
      paste(tableId!, { ...pasteRo, viewId, groupBy, filter, search }),
  });

  const { mutateAsync: temporaryPasteReq } = useMutation({
    mutationFn: (temporaryPasteRo: ITemporaryPasteRo) =>
      temporaryPaste(tableId!, { ...temporaryPasteRo, viewId }),
  });

  const { mutateAsync: clearReq } = useMutation({
    mutationFn: (clearRo: IRangesRo) =>
      clear(tableId!, { ...clearRo, viewId, groupBy, filter, search }),
  });

  const { mutateAsync: deleteReq } = useMutation({
    mutationFn: (deleteRo: IRangesRo) =>
      deleteSelection(tableId!, { ...deleteRo, viewId, groupBy, filter, search }),
  });

  const { toast } = useToast();

  const copyRequest = copyReq || defaultCopyReq;

  const checkCopyAndPasteEnvironment = useCallback(() => {
    // not support http
    if (!isLocalhost() && !isHTTPS()) {
      toast({
        variant: 'destructive',
        description: t('table:table.actionTips.copyAndPasteEnvironment'),
      });
      return false;
    }
    return true;
  }, [toast, t]);

  const doCopy = useCallback(
    async (selection: CombinedSelection, getCopyData?: () => Promise<ICopyVo>) => {
      if (!checkCopyAndPasteEnvironment()) return;
      if (!viewId || !tableId) return;

      const toaster = toast({
        title: t('table:table.actionTips.copying'),
      });

      const getCopyDataDefault = async () => {
        const ranges = selection.serialize();
        const type = rangeTypes[selection.type];
        const { data } = await copyRequest({
          ranges,
          ...(type ? { type } : {}),
        });
        const { content, header } = data;
        return { content, header };
      };

      const getCopyDataInner = getCopyData ?? getCopyDataDefault;

      try {
        await copyHandler(getCopyDataInner);
        toaster.update({ id: toaster.id, title: t('table:table.actionTips.copySuccessful') });
      } catch (e) {
        const error = e as Error;
        toaster.update({
          id: toaster.id,
          variant: 'destructive',
          title: t('table:table.actionTips.copyFailed'),
          description: error.message,
        });
        console.error('Copy error: ', error);
      }
    },
    [checkCopyAndPasteEnvironment, viewId, tableId, toast, copyRequest, t]
  );

  const doPaste = useCallback(
    async (
      e: React.ClipboardEvent,
      selection: CombinedSelection,
      recordMap: IRecordIndexMap,
      updateTemporaryData?: (fieldValueMap: Record<string, unknown>) => void
    ) => {
      if (!checkCopyAndPasteEnvironment()) return;
      if (!viewId || !tableId) return;

      const { files, types } = e.clipboardData;
      const toaster = toast({ title: t('table:table.actionTips.pasting') });

      try {
        if (files.length > 0 && !types.includes(ClipboardTypes.text)) {
          const isSelectionCoverAttachments = selectionCoverAttachments(selection, fields);
          if (!isSelectionCoverAttachments) {
            return toaster.update({
              id: toaster.id,
              title: t('table:table.actionTips.pasteFileFailed'),
            });
          }
          await filePasteHandler({
            files,
            fields,
            selection,
            recordMap,
            requestPaste: async (content, type, ranges) => {
              if (updateTemporaryData) {
                const res = await temporaryPasteReq({ content, ranges });
                const fieldValueMap = res.data[0].fields;
                updateTemporaryData(fieldValueMap);
              } else {
                await pasteReq({ content, type, ranges });
              }
            },
          });
        } else {
          await textPasteHandler(selection, async (content, type, ranges, header) => {
            if (updateTemporaryData) {
              const res = await temporaryPasteReq({ content, ranges, header });
              const fieldValueMap = res.data[0].fields;
              updateTemporaryData(fieldValueMap);
            } else {
              await pasteReq({ content, type, ranges, header });
            }
          });
        }
        toaster.update({ id: toaster.id, title: t('table:table.actionTips.pasteSuccessful') });
      } catch (e) {
        const error = e as Error;
        toaster.update({
          id: toaster.id,
          variant: 'destructive',
          title: t('table:table.actionTips.pasteFailed'),
          description: error.message,
        });
        console.error('Paste error: ', error);
      }
    },
    [viewId, tableId, fields, toast, temporaryPasteReq, pasteReq, checkCopyAndPasteEnvironment, t]
  );

  const doClear = useCallback(
    async (selection: CombinedSelection) => {
      if (!viewId || !tableId) return;

      const toaster = toast({
        title: t('table:table.actionTips.clearing'),
      });
      const ranges = selection.serialize();
      const type = rangeTypes[selection.type];

      await clearReq({
        ranges,
        ...(type ? { type } : {}),
      });

      toaster.update({ id: toaster.id, title: t('table:table.actionTips.clearSuccessful') });
    },
    [tableId, toast, viewId, clearReq, t]
  );

  const doDelete = useCallback(
    async (selection: CombinedSelection) => {
      if (!viewId || !tableId) return;

      const toaster = toast({
        title: t('table:table.actionTips.deleting'),
      });
      const ranges = selection.serialize();
      const type = rangeTypes[selection.type];

      await deleteReq({
        ranges,
        ...(type ? { type } : {}),
      });

      toaster.update({ id: toaster.id, title: t('table:table.actionTips.deleteSuccessful') });
    },
    [deleteReq, tableId, toast, viewId, t]
  );

  return {
    copy: doCopy,
    paste: doPaste,
    clear: doClear,
    deleteRecords: doDelete,
  };
};
