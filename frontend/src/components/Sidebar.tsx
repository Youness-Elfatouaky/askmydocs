import { motion } from "framer-motion";
import type { DocumentRead, User } from "../lib/types";
import { DocumentList } from "./DocumentList";
import { UploadButton } from "./UploadButton";
import { Avatar } from "./Avatar";

type Props = {
  user: User;
  documents: DocumentRead[];
  scopedId: number | null;
  onScope: (id: number | null) => void;
  onUploaded: (d: DocumentRead) => void;
  onDelete: (id: number) => void;
  onLogout: () => void;
};

export function Sidebar({
  user,
  documents,
  scopedId,
  onScope,
  onUploaded,
  onDelete,
  onLogout,
}: Props) {
  return (
    <motion.aside
      className="sidebar"
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <div className="brand">
        <div className="brand-mark">A</div>
        <div>
          <div className="brand-title">AskMyDocs</div>
          <div className="brand-sub">Your private library</div>
        </div>
      </div>

      <section className="sidebar-section">
        <div className="section-head">
          <span>Documents</span>
          <span className="count-pill">{documents.length}</span>
        </div>
        <UploadButton onUploaded={onUploaded} />
        <DocumentList
          documents={documents}
          scopedId={scopedId}
          onScope={onScope}
          onDelete={onDelete}
        />
      </section>

      <div className="sidebar-spacer" />

      <div className="sidebar-profile">
        <Avatar kind="user" name={user.full_name || user.email} size={40} />
        <div className="profile-meta">
          <div className="profile-name">{user.full_name || user.email.split("@")[0]}</div>
          <div className="profile-email" title={user.email}>
            {user.email}
          </div>
        </div>
        <button type="button" className="ghost-btn" onClick={onLogout} aria-label="Sign out">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 17l5-5-5-5M20 12H9M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </motion.aside>
  );
}
