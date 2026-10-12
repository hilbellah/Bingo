import { useState } from 'react';
import { fetchAdminPackages, createAdminPackage, updateAdminPackage, deleteAdminPackage } from '../api';
import { confirmAdminAction } from './adminConfirm';
import { formatPrice } from './adminDashboardHelpers';

// Ticket package admin: list, create, edit, enable/disable and delete.
// Moved verbatim out of AdminDashboard; names are unchanged.
export function usePackagesAdmin({
  token,
}) {
  const [packages, setPackages] = useState([]);
  const [newPackage, setNewPackage] = useState({ name: '', price: '', type: 'optional', max_quantity: 1, sort_order: 0, is_phd: false, description: '' });
  const [editingPackage, setEditingPackage] = useState(null); // { id, name, price, type, max_quantity, sort_order, is_phd } — null when not editing

  const loadPackages = () => fetchAdminPackages(token).then(setPackages);

  const handleTogglePackage = async (id, currentActive) => {
    const pkg = packages.find(p => p.id === id);
    if (!confirmAdminAction({
      action: `${currentActive ? 'Disable' : 'Enable'} this package`,
      details: [pkg ? `Package: ${pkg.name}` : ''],
      warning: currentActive
        ? 'Customers will not be able to add this package to new bookings.'
        : 'Customers will be able to add this package to new bookings.',
    })) return;
    await updateAdminPackage(token, id, { is_active: !currentActive });
    loadPackages();
  };

  const handleCreatePackage = async () => {
    if (!newPackage.name || !newPackage.price) return;
    if (!confirmAdminAction({
      action: 'Create this package',
      details: [
        `Name: ${newPackage.name}`,
        `Price: $${Number.parseFloat(newPackage.price || 0).toFixed(2)}`,
        `Type: ${newPackage.type}`,
        `Max quantity: ${parseInt(newPackage.max_quantity) || 1}`,
      ],
      warning: 'This package can be used for new bookings once active.',
    })) return;
    await createAdminPackage(token, {
      name: newPackage.name,
      price: Math.round(parseFloat(newPackage.price) * 100),
      type: newPackage.type,
      max_quantity: parseInt(newPackage.max_quantity) || 1,
      sort_order: parseInt(newPackage.sort_order) || 0,
      is_phd: newPackage.is_phd,
      description: newPackage.description
    });
    setNewPackage({ name: '', price: '', type: 'optional', max_quantity: 1, sort_order: 0, is_phd: false, description: '' });
    loadPackages();
  };

  // --- Package edit/delete ---
  // Edit: load the package's current values into the inline edit form (price is
  // converted from cents to a string of dollars so the admin sees what they
  // typed originally). Cancel discards. Save PATCHes the row and reloads.
  const handleStartEditPackage = (pkg) => {
    setEditingPackage({
      id: pkg.id,
      name: pkg.name || '',
      price: ((pkg.price || 0) / 100).toFixed(2),
      type: pkg.type || 'optional',
      max_quantity: pkg.max_quantity ?? 1,
      sort_order: pkg.sort_order ?? 0,
      is_phd: !!pkg.is_phd,
      description: pkg.description || '',
    });
  };

  const handleCancelEditPackage = () => setEditingPackage(null);

  const handleSaveEditPackage = async () => {
    if (!editingPackage) return;
    if (!editingPackage.name || editingPackage.price === '' || editingPackage.price == null) {
      alert('Name and price are required.');
      return;
    }
    const priceCents = Math.round(parseFloat(editingPackage.price) * 100);
    if (Number.isNaN(priceCents) || priceCents < 0) {
      alert('Price must be a non-negative number.');
      return;
    }
    if (!confirmAdminAction({
      action: 'Save package changes',
      details: [
        `Name: ${editingPackage.name}`,
        `Price: ${formatPrice(priceCents)}`,
        `Type: ${editingPackage.type}`,
        `Max quantity: ${parseInt(editingPackage.max_quantity) || 1}`,
      ],
      warning: 'This affects new bookings that use this package.',
    })) return;
    try {
      await updateAdminPackage(token, editingPackage.id, {
        name: editingPackage.name,
        price: priceCents,
        type: editingPackage.type,
        max_quantity: parseInt(editingPackage.max_quantity) || 1,
        sort_order: parseInt(editingPackage.sort_order) || 0,
        is_phd: editingPackage.is_phd,
        description: editingPackage.description,
      });
      setEditingPackage(null);
      loadPackages();
    } catch (err) {
      alert('Failed to update package: ' + (err?.message || 'Unknown error'));
    }
  };

  // Delete: confirms first. Server hard-deletes only if no booking_items or
  // booking_addons reference the package; otherwise it returns 409 with a
  // friendly message and the admin sees a guidance alert (use Disable instead).
  const handleDeletePackage = async (pkg) => {
    if (!confirmAdminAction({
      action: `Delete package "${pkg.name}"`,
      warning: `This will permanently remove it. If this package has ever been used in a booking, the system will block the delete and you'll be told to disable it instead. This cannot be undone.`,
    })) return;
    try {
      const result = await deleteAdminPackage(token, pkg.id);
      if (!result.ok) {
        // 409 → in use, 404 → already gone, anything else → generic
        if (result.error === 'package_in_use' && result.message) {
          alert(result.message);
        } else if (result.error) {
          alert('Could not delete package: ' + (result.message || result.error));
        } else {
          alert('Could not delete package (HTTP ' + result.status + ').');
        }
      }
    } catch (err) {
      alert('Failed to delete package: ' + (err?.message || 'Unknown error'));
    }
    loadPackages();
  };

  return {
    packages,
    setPackages,
    newPackage,
    setNewPackage,
    editingPackage,
    setEditingPackage,
    loadPackages,
    handleTogglePackage,
    handleCreatePackage,
    handleStartEditPackage,
    handleCancelEditPackage,
    handleSaveEditPackage,
    handleDeletePackage,
  };
}
