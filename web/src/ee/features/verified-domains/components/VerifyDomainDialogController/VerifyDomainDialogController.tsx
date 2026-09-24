import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { type ReactNode } from "react";
import { type DomainRowData } from "../VerifiedDomainsSettingsTable/VerifiedDomainsSettingsTable";
import { DnsRecordTable } from "../DnsRecordTable/DnsRecordTable";

export function VerifyDomainDialogController({
  children,
  verifyingDomainId,
  onVerify,
}: {
  children: (control: {
    openDialog: (row: DomainRowData) => void;
  }) => ReactNode;
  verifyingDomainId: string | null;
  onVerify: (row: DomainRowData) => Promise<void>;
}) {
  return (
    <DialogController<DomainRowData>
      onBeforeClose={() => verifyingDomainId === null}
      renderDialog={({ state: row, closeDialog }) => (
        <Dialog
          size="lg"
          title={`Verify ${row.domain}`}
          actions={[
            {
              label: "Verify domain",
              loading: verifyingDomainId === row.id,
              onClick: async () => {
                try {
                  await onVerify(row);
                  closeDialog();
                } catch {
                  // The connected table reports the mutation error.
                }
              },
            },
          ]}
        >
          <Dialog.Body>
            <p className="text-sm font-bold">
              Add the following TXT record to your DNS provider:
            </p>
            <DnsRecordTable
              recordHost={row.recordHost}
              recordValue={row.recordValue}
            />
            <p className="text-muted-foreground text-xs">
              DNS changes may take up to 24h to propagate. After adding the
              record, click <span className="font-bold">Verify</span>.
            </p>
          </Dialog.Body>
        </Dialog>
      )}
    >
      {({ openDialog }) => children({ openDialog })}
    </DialogController>
  );
}
