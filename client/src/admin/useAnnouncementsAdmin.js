import { useState } from 'react';
import { fetchAdminAnnouncements, createAdminAnnouncement, updateAdminAnnouncement, deleteAdminAnnouncement, uploadImage } from '../api';
import { confirmAdminAction } from './adminConfirm';

// Announcements admin: list, create (with optional image upload), toggle and
// delete. Moved verbatim out of AdminDashboard; names are unchanged.
export function useAnnouncementsAdmin({
  token,
}) {
  const [announcements, setAnnouncements] = useState([]);
  const [newAnnouncement, setNewAnnouncement] = useState({ title: '', message: '', type: 'info', start_date: '', end_date: '', image_url: '' });
  const [announcementImageFile, setAnnouncementImageFile] = useState(null);
  const [announcementImagePreview, setAnnouncementImagePreview] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const loadAnnouncements = () => fetchAdminAnnouncements(token).then(setAnnouncements);

  const handleCreateAnnouncement = async () => {
    if (!newAnnouncement.message) return;
    if (!confirmAdminAction({
      action: 'Create this announcement',
      details: [
        `Title: ${newAnnouncement.title || '(no title)'}`,
        `Type: ${newAnnouncement.type}`,
        `Start: ${newAnnouncement.start_date || 'Immediately'}`,
        `End: ${newAnnouncement.end_date || 'No end date'}`,
      ],
      warning: 'This will be shown on the public site while active.',
    })) return;
    let imageUrl = newAnnouncement.image_url || '';
    // Upload image file if selected
    if (announcementImageFile) {
      setUploadingImage(true);
      try {
        const result = await uploadImage(token, announcementImageFile);
        imageUrl = result.url;
      } catch (err) {
        setUploadingImage(false);
        return;
      }
      setUploadingImage(false);
    }
    await createAdminAnnouncement(token, { ...newAnnouncement, image_url: imageUrl || null });
    setNewAnnouncement({ title: '', message: '', type: 'info', start_date: '', end_date: '', image_url: '' });
    setAnnouncementImageFile(null);
    setAnnouncementImagePreview(null);
    loadAnnouncements();
  };

  const handleToggleAnnouncement = async (id, currentActive) => {
    if (!confirmAdminAction({
      action: `${currentActive ? 'Deactivate' : 'Activate'} this announcement`,
      warning: 'This changes whether customers can see it.',
    })) return;
    await updateAdminAnnouncement(token, id, { is_active: !currentActive });
    loadAnnouncements();
  };

  const handleDeleteAnnouncement = async (id) => {
    if (!confirmAdminAction({
      action: 'Delete this announcement',
      warning: 'This cannot be undone.',
    })) return;
    await deleteAdminAnnouncement(token, id);
    loadAnnouncements();
  };

  return {
    announcements,
    setAnnouncements,
    newAnnouncement,
    setNewAnnouncement,
    announcementImageFile,
    setAnnouncementImageFile,
    announcementImagePreview,
    setAnnouncementImagePreview,
    uploadingImage,
    setUploadingImage,
    loadAnnouncements,
    handleCreateAnnouncement,
    handleToggleAnnouncement,
    handleDeleteAnnouncement,
  };
}
