import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { api, humanizeError, ApiError } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import type { BankAccount, BankAccountInput } from '../../types';

interface BankFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  bank?: BankAccount | null;
  onSaved: () => void;
}

const NUMBER_REQUIRED = 'Account number is required.';

export function BankFormModal({ isOpen, onClose, bank, onSaved }: BankFormModalProps) {
  const toast = useToast();
  const [bankName, setBankName] = useState('');
  const [holderName, setHolderName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [branchName, setBranchName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (bank) {
      setBankName(bank.bank_name || '');
      setHolderName(bank.holder_name || '');
      setAccountNumber(bank.account_number || '');
      setIfsc(bank.ifsc || '');
      setBranchName(bank.branch_name || '');
    } else {
      setBankName('');
      setHolderName('');
      setAccountNumber('');
      setIfsc('');
      setBranchName('');
    }
    setError(null);
  }, [bank, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!accountNumber.trim()) {
      setError(NUMBER_REQUIRED);
      return;
    }

    setLoading(true);
    setError(null);

    const payload: BankAccountInput = {
      bank_name: bankName.trim(),
      holder_name: holderName.trim(),
      account_number: accountNumber.trim(),
      ifsc: ifsc.trim().toUpperCase(),
      branch_name: branchName.trim(),
    };

    try {
      if (bank) {
        await api.banks.update(bank.id, payload);
        toast.success('Bank account updated');
      } else {
        await api.banks.create(payload);
        toast.success('Bank account added');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err instanceof ApiError ? humanizeError(err.code) : 'Failed to save account');
    } finally {
      setLoading(false);
    }
  };

  const numberError = error === NUMBER_REQUIRED ? error : null;
  const formError = error && error !== NUMBER_REQUIRED ? error : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={bank ? 'Edit bank account' : 'Add bank account'}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="btn text">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className={`btn filled${loading ? ' is-busy' : ''}`}
            aria-disabled={loading ? 'true' : undefined}
          >
            <span className="loading" aria-hidden="true" />
            {bank ? 'Save changes' : 'Add account'}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="fields" aria-busy={loading || undefined} noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="field">
            <label className="field-label" htmlFor="bank-name">
              Bank name<span className="opt"> (optional)</span>
            </label>
            <input
              id="bank-name"
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="e.g. State Bank of India"
              autoFocus
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="bank-holder">
              Account holder<span className="opt"> (optional)</span>
            </label>
            <input
              id="bank-holder"
              type="text"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              placeholder="John Doe"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className={`field${numberError ? ' invalid' : ''}`}>
            <label className="field-label" htmlFor="bank-account-number">
              Account number
            </label>
            <input
              id="bank-account-number"
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="123456789012"
              required
              autoComplete="off"
              className="font-mono tabular"
              aria-invalid={numberError ? 'true' : undefined}
              aria-describedby="bank-account-number-error"
            />
            <p id="bank-account-number-error" className="field-error" aria-live="polite">
              {numberError || ''}
            </p>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="bank-ifsc">
              IFSC or routing code<span className="opt"> (optional)</span>
            </label>
            <input
              id="bank-ifsc"
              type="text"
              value={ifsc}
              onChange={(e) => setIfsc(e.target.value.toUpperCase())}
              placeholder="SBIN0001234"
              className="font-mono tabular"
            />
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="bank-branch">
            Branch name<span className="opt"> (optional)</span>
          </label>
          <input
            id="bank-branch"
            type="text"
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            placeholder="Main Downtown Branch"
          />
        </div>

        {formError && (
          <p className="field-error" role="alert">
            {formError}
          </p>
        )}
      </form>
    </Modal>
  );
}
