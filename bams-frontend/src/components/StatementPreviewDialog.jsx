import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import StatementFilePreview from "./StatementFilePreview";

/** Statement PDF preview for places that are already inside a CustomDrawer
 * (e.g. the account timeline). Built on the same @radix-ui/react-dialog as
 * CustomDrawer on purpose: DialogPopup comes from @radix-ui/themes, which
 * bundles a separate copy of Radix Dialog -- opened over the drawer, the two
 * don't see each other as nested, so a click inside the preview would close
 * the drawer and their focus traps would fight. */
const StatementPreviewDialog = ({ open, setOpen, storageKey, fileName }) => (
  <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
      <Dialog.Content
        aria-describedby={undefined}
        className="fixed left-1/2 top-1/2 z-[60] flex max-h-[94vh] w-[min(1200px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl bg-white p-5 shadow-2xl focus:outline-none"
      >
        <div className="flex items-center justify-between gap-3">
          <Dialog.Title className="truncate text-lg font-bold text-gray-900" title={fileName}>
            {fileName || "Statement"}
          </Dialog.Title>
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="Close"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </Dialog.Close>
        </div>

        {open && <StatementFilePreview storageKey={storageKey} fileName={fileName} />}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);

export default StatementPreviewDialog;
