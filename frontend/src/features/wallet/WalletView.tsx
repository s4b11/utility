import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  Building2,
  Plus,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
} from 'lucide-react';
import { api, ApiError, humanizeError } from '../../lib/api';
import { triggerHaptic } from '../../lib/haptics';
import { useToast } from '../../context/ToastContext';
import { CopyButton } from '../../components/ui/CopyButton';
import { CardFormModal } from './CardFormModal';
import { BankFormModal } from './BankFormModal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageSkeleton } from '../../components/ui/Skeleton';
import type { Card, BankAccount } from '../../types';
import { ConnectedGroup } from '../../components/ui/ConnectedGroup';

function maskCardNumber(num: string): string {
  const clean = (num || '').replace(/\D/g, '');
  const last4 = clean.slice(-4) || '••••';
  return `•••• •••• •••• ${last4}`;
}

const CARD_NETWORKS: Record<string, { label: string; tone: string }> = {
  visa: { label: 'Visa', tone: 't-primary' },
  mastercard: { label: 'Mastercard', tone: 't-warning' },
  rupay: { label: 'RuPay', tone: 't-violet' },
  amex: { label: 'Amex', tone: 't-teal' },
  other: { label: 'Card', tone: 't-neutral' },
};

/** Small tone tile + label for the card network (colour only inside the tile). */
function cardNetwork(type?: string): { label: string; tone: string } {
  const key = String(type || '').trim().toLowerCase();
  return CARD_NETWORKS[key] || { label: type ? String(type) : 'Card', tone: 't-neutral' };
}

function maskAccountNumber(num: string): string {
  const s = String(num || '');
  return s.length > 4 ? `${'•'.repeat(s.length - 4)}${s.slice(-4)}` : s;
}

export function WalletView() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'cards' | 'banks'>('cards');
  const [cards, setCards] = useState<Card[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);

  // Mask / Reveal states
  const [revealedCards, setRevealedCards] = useState<Set<number>>(new Set());
  const [revealedBanks, setRevealedBanks] = useState<Set<number>>(new Set());

  // Modal states
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [editingBank, setEditingBank] = useState<BankAccount | null>(null);
  const [deletingItem, setDeletingItem] = useState<{ id: number; type: 'card' | 'bank'; name: string } | null>(
    null
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'cards') {
        const data = await api.cards.list();
        setCards(data);
      } else {
        const data = await api.banks.list();
        setBanks(data);
      }
    } catch (err: any) {
      toast.error(err instanceof ApiError ? humanizeError(err.code) : 'Failed to load wallet data');
    } finally {
      setLoading(false);
    }
  }, [activeTab, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleCardReveal = (id: number) => {
    triggerHaptic('light');
    setRevealedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleBankReveal = (id: number) => {
    triggerHaptic('light');
    setRevealedBanks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deletingItem) return;
    try {
      if (deletingItem.type === 'card') {
        await api.cards.remove(deletingItem.id);
        setCards((prev) => prev.filter((c) => c.id !== deletingItem.id));
      } else {
        await api.banks.remove(deletingItem.id);
        setBanks((prev) => prev.filter((b) => b.id !== deletingItem.id));
      }
      toast.success('Deleted');
    } catch {
      toast.error('Delete failed');
    }
  };

  const openAdd = () => {
    triggerHaptic('light');
    if (activeTab === 'cards') {
      setEditingCard(null);
      setIsCardModalOpen(true);
    } else {
      setEditingBank(null);
      setIsBankModalOpen(true);
    }
  };

  const addLabel = activeTab === 'cards' ? 'Add card' : 'Add bank';

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      {/* Cards / Banks switch and the single primary action */}
      <div className="flex flex-wrap items-center gap-2">
        <ConnectedGroup
          ariaLabel="Wallet section"
          size="xs"
          value={activeTab}
          onChange={(v) => setActiveTab(v)}
          options={[{ value: 'cards', label: 'Cards', icon: CreditCard }, { value: 'banks', label: 'Banks', icon: Building2 }]}
        />

        <button type="button" onClick={openAdd} className="btn filled create-fab ml-auto" aria-label={addLabel}>
          <Plus className="i" aria-hidden="true" />
          <span className="inline max-sm:hidden">{addLabel}</span>
          <span className="sm:hidden">Add</span>
        </button>
      </div>

      {/* Cards Tab Content */}
      {activeTab === 'cards' && (
        <>
          {loading ? (
            <PageSkeleton kind="wallet" />
          ) : cards.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No cards yet"
              hint="Store your credit and debit cards securely with AES-256-GCM at-rest encryption."
              actionLabel="Add card"
              onAction={() => setIsCardModalOpen(true)}
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {cards.map((card) => {
                const isRevealed = revealedCards.has(card.id);
                const network = cardNetwork(card.card_type);
                const title = card.card_name || card.bank_name || 'Payment card';
                return (
                  <article
                    key={card.id}
                    className="flex min-w-0 flex-col gap-3.5 rounded-lg border border-outline-variant bg-surface-container-lowest p-4"
                  >
                    {/* Header: network tile, name, row actions */}
                    <div className="flex items-start gap-3">
                      <span className={`shape-icon ${network.tone}`} aria-hidden="true">
                        <CreditCard className="i" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate title-small text-on-surface">{title}</h4>
                        <p className="truncate body-medium text-on-surface-variant">
                          {network.label}
                          {card.bank_name ? ` · ${card.bank_name}` : ''}
                        </p>
                      </div>
                      <div className="actions -mr-1 -mt-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            setEditingCard(card);
                            setIsCardModalOpen(true);
                          }}
                          className="icon-btn"
                          aria-label="Edit card"
                          data-tip="Edit card"
                        >
                          <Pencil className="i" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('error');
                            setDeletingItem({ id: card.id, type: 'card', name: card.card_name || 'Card' });
                          }}
                          className="icon-btn danger"
                          aria-label="Delete card"
                          data-tip="Delete card"
                        >
                          <Trash2 className="i" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    {/* Card number: masked or revealed */}
                    <div className="linkbox">
                      <span className="font-mono tabular body-medium text-on-surface">
                        {isRevealed ? card.card_number : maskCardNumber(card.card_number)}
                      </span>
                      <CopyButton text={card.card_number} ariaLabel="Copy card number" />
                      <button
                        type="button"
                        onClick={() => toggleCardReveal(card.id)}
                        className="icon-btn"
                        aria-label={isRevealed ? 'Hide card details' : 'Show card details'}
                        data-tip={isRevealed ? 'Hide card details' : 'Show card details'}
                        aria-pressed={isRevealed}
                      >
                        {isRevealed ? <EyeOff className="i" aria-hidden="true" /> : <Eye className="i" aria-hidden="true" />}
                      </button>
                    </div>

                    {/* Details */}
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 body-medium">
                      <div className="min-w-0">
                        <dt className="body-small text-on-surface-variant">Holder</dt>
                        <dd className="truncate text-on-surface">{card.holder_name || '—'}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="body-small text-on-surface-variant">Expires</dt>
                        <dd className="font-mono tabular text-on-surface">{card.expiry || '—'}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="body-small text-on-surface-variant">CVV</dt>
                        <dd className="font-mono tabular text-on-surface">{isRevealed ? card.cvv || '—' : '•••'}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="body-small text-on-surface-variant">Bank</dt>
                        <dd className="truncate text-on-surface">{card.bank_name || '—'}</dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Banks Tab Content */}
      {activeTab === 'banks' && (
        <>
          {loading ? (
            <PageSkeleton kind="wallet" />
          ) : banks.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No bank accounts yet"
              hint="Keep track of your bank account numbers, branch IFSC codes, and details."
              actionLabel="Add bank account"
              onAction={() => setIsBankModalOpen(true)}
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {banks.map((bank) => {
                const isRevealed = revealedBanks.has(bank.id);
                return (
                  <article
                    key={bank.id}
                    className="flex min-w-0 flex-col gap-3.5 rounded-lg border border-outline-variant bg-surface-container-lowest p-4"
                  >
                    <div className="flex items-start gap-3">
                      <span className="shape-icon t-teal" aria-hidden="true">
                        <Building2 className="i" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate title-small text-on-surface">
                          {bank.bank_name || 'Bank account'}
                        </h4>
                        <p className="truncate body-medium text-on-surface-variant">
                          {bank.holder_name || 'Bank account'}
                        </p>
                      </div>
                      <div className="actions -mr-1 -mt-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            setEditingBank(bank);
                            setIsBankModalOpen(true);
                          }}
                          className="icon-btn"
                          aria-label="Edit bank account"
                          data-tip="Edit bank account"
                        >
                          <Pencil className="i" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('error');
                            setDeletingItem({ id: bank.id, type: 'bank', name: bank.bank_name || 'Bank' });
                          }}
                          className="icon-btn danger"
                          aria-label="Delete bank account"
                          data-tip="Delete bank account"
                        >
                          <Trash2 className="i" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    {/* Account number: masked or revealed */}
                    <div className="linkbox">
                      <span className="font-mono tabular body-medium text-on-surface">
                        {isRevealed ? bank.account_number : maskAccountNumber(bank.account_number)}
                      </span>
                      <CopyButton text={bank.account_number} ariaLabel="Copy account number" />
                      <button
                        type="button"
                        onClick={() => toggleBankReveal(bank.id)}
                        className="icon-btn"
                        aria-label={isRevealed ? 'Hide account number' : 'Show account number'}
                        data-tip={isRevealed ? 'Hide account number' : 'Show account number'}
                        aria-pressed={isRevealed}
                      >
                        {isRevealed ? <EyeOff className="i" aria-hidden="true" /> : <Eye className="i" aria-hidden="true" />}
                      </button>
                    </div>

                    {/* Bank details */}
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 body-medium">
                      <div className="min-w-0">
                        <dt className="body-small text-on-surface-variant">Holder</dt>
                        <dd className="truncate text-on-surface">{bank.holder_name || '—'}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="body-small text-on-surface-variant">IFSC</dt>
                        <dd className="truncate font-mono tabular text-on-surface">{bank.ifsc || '—'}</dd>
                      </div>
                      <div className="col-span-2 min-w-0">
                        <dt className="body-small text-on-surface-variant">Branch</dt>
                        <dd className="truncate text-on-surface">{bank.branch_name || '—'}</dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Card Form Modal */}
      <CardFormModal
        isOpen={isCardModalOpen}
        onClose={() => {
          setIsCardModalOpen(false);
          setEditingCard(null);
        }}
        card={editingCard}
        onSaved={loadData}
      />

      {/* Bank Form Modal */}
      <BankFormModal
        isOpen={isBankModalOpen}
        onClose={() => {
          setIsBankModalOpen(false);
          setEditingBank(null);
        }}
        bank={editingBank}
        onSaved={loadData}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={deletingItem !== null}
        onClose={() => setDeletingItem(null)}
        onConfirm={handleDeleteConfirm}
        title={deletingItem?.type === 'bank' ? 'Delete bank account?' : 'Delete card?'}
        message={`"${deletingItem?.name}" will be permanently removed.`}
      />
    </div>
  );
}
