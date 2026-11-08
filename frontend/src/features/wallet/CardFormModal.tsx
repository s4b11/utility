import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { ChevronDown } from 'lucide-react';
import { api, humanizeError, ApiError } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import type { Card, CardInput } from '../../types';

interface CardFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  card?: Card | null;
  onSaved: () => void;
}

const CARD_TYPES: [string, string][] = [
  ['visa', 'Visa'],
  ['mastercard', 'Mastercard'],
  ['rupay', 'RuPay'],
  ['other', 'Other'],
];

const NUMBER_REQUIRED = 'Card number is required.';

export function CardFormModal({ isOpen, onClose, card, onSaved }: CardFormModalProps) {
  const toast = useToast();
  const [cardName, setCardName] = useState('');
  const [holderName, setHolderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardType, setCardType] = useState('visa');
  const [bankName, setBankName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (card) {
      setCardName(card.card_name || '');
      setHolderName(card.holder_name || '');
      setCardNumber(card.card_number || '');
      setExpiry(card.expiry || '');
      setCvv(card.cvv || '');
      setCardType((card.card_type || 'visa').toLowerCase());
      setBankName(card.bank_name || '');
    } else {
      setCardName('');
      setHolderName('');
      setCardNumber('');
      setExpiry('');
      setCvv('');
      setCardType('visa');
      setBankName('');
    }
    setError(null);
  }, [card, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!cardNumber.trim()) {
      setError(NUMBER_REQUIRED);
      return;
    }

    setLoading(true);
    setError(null);

    const payload: CardInput = {
      card_name: cardName.trim(),
      holder_name: holderName.trim(),
      card_number: cardNumber.trim(),
      expiry: expiry.trim(),
      cvv: cvv.trim(),
      card_type: cardType,
      bank_name: bankName.trim(),
    };

    try {
      if (card) {
        await api.cards.update(card.id, payload);
        toast.success('Card updated');
      } else {
        await api.cards.create(payload);
        toast.success('Card added');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err instanceof ApiError ? humanizeError(err.code) : 'Failed to save card');
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
      title={card ? 'Edit card' : 'Add card'}
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
            {card ? 'Save changes' : 'Add card'}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="fields" aria-busy={loading || undefined} noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="field">
            <label className="field-label" htmlFor="card-name">
              Card label<span className="opt"> (optional)</span>
            </label>
            <input
              id="card-name"
              type="text"
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              placeholder="e.g. HDFC Regalia"
              autoFocus
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="card-holder">
              Cardholder name<span className="opt"> (optional)</span>
            </label>
            <input
              id="card-holder"
              type="text"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              placeholder="John Doe"
            />
          </div>
        </div>

        <div className={`field${numberError ? ' invalid' : ''}`}>
          <label className="field-label" htmlFor="card-number">
            Card number
          </label>
          <input
            id="card-number"
            type="text"
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value)}
            placeholder="1234 5678 9012 3456"
            required
            maxLength={19}
            autoComplete="off"
            className="font-mono tabular"
            aria-invalid={numberError ? 'true' : undefined}
            aria-describedby="card-number-error"
          />
          <p id="card-number-error" className="field-error" aria-live="polite">
            {numberError || ''}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="field col-span-2 sm:col-span-1">
            <label className="field-label" htmlFor="card-type">
              Card type
            </label>
            <div className="select-wrap">
              <select id="card-type" value={cardType} onChange={(e) => setCardType(e.target.value)}>
                {CARD_TYPES.map(([val, text]) => (
                  <option key={val} value={val}>
                    {text}
                  </option>
                ))}
              </select>
              <ChevronDown className="i" aria-hidden="true" />
            </div>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="card-expiry">
              Expiry
            </label>
            <input
              id="card-expiry"
              type="text"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              placeholder="MM/YY"
              maxLength={7}
              className="font-mono tabular"
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="card-cvv">
              CVV
            </label>
            <input
              id="card-cvv"
              type="password"
              value={cvv}
              onChange={(e) => setCvv(e.target.value)}
              placeholder="•••"
              maxLength={4}
              autoComplete="off"
              className="font-mono tabular"
            />
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="card-bank">
            Bank or issuer<span className="opt"> (optional)</span>
          </label>
          <input
            id="card-bank"
            type="text"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="e.g. Chase / HDFC Bank"
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
