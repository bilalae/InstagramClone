import { useState } from "react";
import { Modal, Status } from "../../components/Shared";
import { db, check, errorText } from "../../services/social";
export function Report({
  me,
  type,
  id,
}: {
  me: string;
  type: string;
  id: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <button onClick={() => setOpen(true)}>Report</button>
      {open && (
        <Modal title="Report" close={() => setOpen(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                check(
                  await db.from("reports").insert({
                    reporter_id: me,
                    target_type: type,
                    target_id: id,
                    reason: String(new FormData(e.currentTarget).get("reason")),
                  }),
                );
                setOpen(false);
              } catch (err) {
                setError(errorText(err));
              }
            }}
          >
            <label>
              Reason
              <textarea name="reason" required maxLength={2200} />
            </label>
            <button>Submit report</button>
            <Status error={error} />
          </form>
        </Modal>
      )}
    </>
  );
}
