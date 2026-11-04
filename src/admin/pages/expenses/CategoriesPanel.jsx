import { useEffect, useState } from 'react';
import AdminIcon from '../../components/AdminIcon.jsx';
import { Field, Modal, useToast } from '../../components/ui.jsx';
import { api } from '../../lib/api/index.js';

function CategoryForm({ open, item, onClose, onSaved }) {
  const notify = useToast();
  const [name, setName] = useState('');
  const [tax, setTax] = useState('');
  const [active, setActive] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? '');
    setTax(item?.tax_category ?? '');
    setActive(item?.active ?? true);
    setError('');
  }, [open, item]);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Give the category a name.');
      return;
    }
    setBusy(true);
    try {
      await api.saveCategory({ ...(item ? { id: item.id } : {}), name: name.trim(), tax_category: tax.trim(), active });
      notify(item ? 'Category updated' : 'Category added');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={item ? 'Edit category' : 'Add category'}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="submit" form="category-form" disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <form id="category-form" onSubmit={submit} noValidate className="space-y-4">
        <Field label="Name" error={error}>
          {(p) => <input {...p} className="input" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Tax category" optional hint="A suggested line for your tax preparer, e.g. “Supplies” or “Car and truck expenses”.">
          {(p) => <input {...p} className="input" value={tax} onChange={(e) => setTax(e.target.value)} />}
        </Field>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl bg-blush/60 px-4">
          <input type="checkbox" className="h-5 w-5 accent-[#9c3d5d]" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span className="text-sm font-semibold">Active</span>
          <span className="text-xs text-muted">Inactive categories are hidden when adding expenses but kept on old ones.</span>
        </label>
      </form>
    </Modal>
  );
}

export default function CategoriesPanel({ categories, onChanged }) {
  const [editing, setEditing] = useState(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm text-muted">
          Tax categories are suggestions to help organize your records for bookkeeping. Confirm how to report each one with your
          tax preparer.
        </p>
        <button type="button" className="btn-ghost shrink-0" onClick={() => setEditing('new')}>
          <AdminIcon name="plus" className="h-4 w-4" />
          Add category
        </button>
      </div>
      <ul className="card divide-y divide-line overflow-hidden">
        {categories.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => setEditing(c)} className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition hover:bg-blush/40">
              <span className="min-w-0 flex-1">
                <span className={`block font-semibold ${c.active ? '' : 'text-muted line-through decoration-1'}`}>{c.name}</span>
                <span className="block truncate text-sm text-muted">{c.tax_category || 'No tax category set'}</span>
              </span>
              {!c.active && <span className="pill bg-blush text-muted">Inactive</span>}
              <AdminIcon name="edit" className="h-4 w-4 shrink-0 text-muted" />
            </button>
          </li>
        ))}
      </ul>
      <CategoryForm
        open={editing !== null}
        item={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onChanged();
        }}
      />
    </div>
  );
}
