import React, { useState } from 'react';
import {
  Check,
  ExternalLink,
  MessageSquare,
  CalendarClock,
  Trash2,
  X,
  AlertTriangle,
} from 'lucide-react';
import {
  DailyScheduleProposal,
  JarvisTask,
  VerifiedContact,
  WhatsAppDraft,
} from '../lib/jarvisCore';

interface WhatsAppConfirmCardProps {
  draft: WhatsAppDraft;
  contacts: VerifiedContact[];
  onConfirmOpenWhatsApp: (updatedDraft: WhatsAppDraft) => void;
  onCancelDraft: () => void;
  onResolveContact: (contact: VerifiedContact) => void;
}

export const WhatsAppConfirmationCard: React.FC<WhatsAppConfirmCardProps> = ({
  draft,
  contacts,
  onConfirmOpenWhatsApp,
  onCancelDraft,
  onResolveContact,
}) => {
  const [editedMessage, setEditedMessage] = useState(draft.message);
  const [manualPhone, setManualPhone] = useState(draft.phoneE164);

  const activePhone = manualPhone.trim() || draft.phoneE164;
  const digitsOnly = activePhone.replace(/[^\d]/g, '');
  const encodedMsg = encodeURIComponent(editedMessage.trim());
  const computedWaUrl = digitsOnly
    ? `https://wa.me/${digitsOnly}?text=${encodedMsg}`
    : '';

  return (
    <div
      data-testid="whatsapp-confirmation-card"
      className="liquid-glass-card rounded-3xl p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="liquid-accent-text h-4 w-4" />
          <h3 className="text-sm font-semibold text-white">
            Prepare and Open WhatsApp Message
          </h3>
        </div>
        <span className="liquid-accent-text text-xs font-medium">
          Explicit User Confirmation Required
        </span>
      </div>

      {/* Contact Ambiguity or Missing Contact Picker */}
      {(draft.status === 'AMBIGUOUS_CONTACT' || draft.status === 'MISSING_CONTACT') && (
        <div className="liquid-glass-subcard mt-3 rounded-2xl p-3 text-xs text-amber-200">
          <p className="font-medium">
            {draft.status === 'AMBIGUOUS_CONTACT'
              ? `Multiple contacts matched "${draft.recipientName}". Select the verified recipient below:`
              : `"${draft.recipientName}" was not found in your verified contacts. Select a verified contact or enter an E.164 phone number:`}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {(draft.candidateContacts || contacts).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setManualPhone(c.phoneE164);
                  onResolveContact(c);
                }}
                className="liquid-glass-chip rounded-xl px-3 py-1.5 text-xs font-medium text-slate-100 whitespace-nowrap shrink-0"
              >
                {c.name} · {c.phoneE164}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="wa-recipient-name"
            className="block text-xs font-medium text-slate-300"
          >
            Verified Recipient
          </label>
          <input
            id="wa-recipient-name"
            type="text"
            readOnly
            value={draft.recipientName}
            className="liquid-glass-input mt-1 w-full rounded-xl px-3 py-2 text-sm text-slate-100"
          />
        </div>
        <div>
          <label
            htmlFor="wa-recipient-phone"
            className="block text-xs font-medium text-slate-300"
          >
            WhatsApp Number (E.164)
          </label>
          <input
            id="wa-recipient-phone"
            type="text"
            value={manualPhone}
            onChange={(e) => setManualPhone(e.target.value)}
            placeholder="+919876543210"
            className="liquid-glass-input mt-1 w-full rounded-xl px-3 py-2 font-mono text-sm text-white focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-3">
        <label
          htmlFor="wa-message-body"
          className="block text-xs font-medium text-slate-300"
        >
          Message Text to Prefill
        </label>
        <textarea
          id="wa-message-body"
          rows={2}
          value={editedMessage}
          onChange={(e) => setEditedMessage(e.target.value)}
          className="liquid-glass-input mt-1 w-full rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
        />
      </div>

      <p className="mt-2.5 text-xs text-slate-300">
        Safety Notice: JARVIS never sends messages silently or uses Accessibility tap hacks.
        Confirming below opens WhatsApp with your text prefilled so you can press WhatsApp&apos;s
        Send button.
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancelDraft}
          className="liquid-glass-chip flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-medium text-slate-200 whitespace-nowrap shrink-0"
        >
          <X className="h-4 w-4" />
          Cancel
        </button>

        <a
          href={computedWaUrl || '#'}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            if (!digitsOnly || !editedMessage.trim()) {
              e.preventDefault();
              return;
            }
            onConfirmOpenWhatsApp({
              ...draft,
              phoneE164: activePhone,
              message: editedMessage.trim(),
              waMeUrl: computedWaUrl,
              status: 'OPENED_IN_WHATSAPP',
            });
          }}
          className={`flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
            digitsOnly && editedMessage.trim()
              ? 'liquid-glass-btn-primary'
              : 'pointer-events-none bg-slate-800/60 text-slate-500'
          }`}
        >
          <ExternalLink className="h-4 w-4" />
          Prepare and Open Message
        </a>
      </div>
    </div>
  );
};

interface DailyScheduleConfirmCardProps {
  proposal: DailyScheduleProposal;
  onConfirmProposal: (updatedProposal: DailyScheduleProposal) => void;
  onDiscardProposal: () => void;
}

export const DailyScheduleConfirmationCard: React.FC<DailyScheduleConfirmCardProps> = ({
  proposal,
  onConfirmProposal,
  onDiscardProposal,
}) => {
  const [blocks, setBlocks] = useState(proposal.blocks);
  const [enableNotifications, setEnableNotifications] = useState(
    proposal.enableNotifications
  );

  const updateDuration = (id: string, durationMinutes: number) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === id ? { ...b, durationMinutes: Math.max(15, durationMinutes) } : b
      )
    );
  };

  return (
    <div
      data-testid="daily-schedule-proposal-card"
      className="liquid-glass-card rounded-3xl p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="liquid-accent-text h-4 w-4" />
          <h3 className="text-sm font-semibold text-white">
            Proposed Daily Schedule ({proposal.dateStr})
          </h3>
        </div>
        <span className="text-xs text-slate-300">
          {blocks.length} blocks · {proposal.conflictsDetected} overlap(s) resolved
        </span>
      </div>

      <div className="mt-4 space-y-2.5">
        {blocks.map((block) => (
          <div
            key={block.id}
            className="liquid-glass-subcard flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3"
          >
            <div>
              <p className="text-sm font-medium text-white">{block.title}</p>
              <p className="mt-0.5 font-mono text-xs text-slate-300 tabular-nums">
                {new Date(block.startTimeIso).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                –{' '}
                {new Date(block.endTimeIso).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                · {block.category} · {block.priority}
              </p>
              {block.hasConflict && (
                <p className="mt-1 flex items-center gap-1 text-xs text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Automatically shifted after existing task &quot;{block.conflictWithTitle}&quot;
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor={`dur-${block.id}`} className="text-xs text-slate-300">
                Duration (min)
              </label>
              <input
                id={`dur-${block.id}`}
                type="number"
                min={15}
                max={240}
                step={15}
                value={block.durationMinutes}
                onChange={(e) =>
                  updateDuration(block.id, Number.parseInt(e.target.value, 10) || 45)
                }
                className="liquid-glass-input w-20 rounded-lg px-2.5 py-1.5 font-mono text-xs text-white tabular-nums"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
        <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={enableNotifications}
            onChange={(e) => setEnableNotifications(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-black/50"
          />
          Schedule Android reminder notifications for all blocks
        </label>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onDiscardProposal}
            className="liquid-glass-chip flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-medium text-slate-200 whitespace-nowrap shrink-0"
          >
            <X className="h-4 w-4" />
            Discard
          </button>
          <button
            type="button"
            onClick={() =>
              onConfirmProposal({
                ...proposal,
                blocks,
                enableNotifications,
                confirmed: true,
              })
            }
            className="liquid-glass-btn-primary flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold whitespace-nowrap shrink-0"
          >
            <Check className="h-4 w-4" />
            Confirm Schedule
          </button>
        </div>
      </div>
    </div>
  );
};

interface DeleteTaskConfirmCardProps {
  task: JarvisTask;
  onConfirmDelete: (taskId: string) => void;
  onCancelDelete: () => void;
}

export const DeleteTaskConfirmCard: React.FC<DeleteTaskConfirmCardProps> = ({
  task,
  onConfirmDelete,
  onCancelDelete,
}) => {
  return (
    <div className="liquid-glass-card rounded-3xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-rose-200">
            Confirm Task Deletion: &quot;{task.title}&quot;
          </p>
          <p className="mt-0.5 text-xs text-slate-300">
            Scheduled for {new Date(task.scheduledAt).toLocaleString()} · Destructive actions
            require confirmation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancelDelete}
            className="liquid-glass-chip rounded-xl px-3.5 py-2 text-xs font-medium text-slate-200 whitespace-nowrap shrink-0"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirmDelete(task.id)}
            className="flex items-center gap-1.5 rounded-xl bg-rose-500 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-400 whitespace-nowrap shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Confirm Delete
          </button>
        </div>
      </div>
    </div>
  );
};
