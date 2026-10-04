'use client';

import { ImageUploadField } from '@/components/VenueForm/ImageUploadField';
import styles from './events.module.scss';

export type TeamContactForm = {
  name: string;
  phone: string;
  email: string;
  image_url: string;
};

export function emptyTeamContact(): TeamContactForm {
  return { name: '', phone: '', email: '', image_url: '' };
}

type EventTeamFieldsProps = {
  title: string;
  description: string;
  value: TeamContactForm;
  onChange: (value: TeamContactForm) => void;
};

export function EventTeamFields({ title, description, value, onChange }: EventTeamFieldsProps) {
  function setField(field: keyof TeamContactForm, next: string) {
    onChange({ ...value, [field]: next });
  }

  return (
    <section className={styles.teamCard}>
      <h2>{title}</h2>
      <p className={styles.wizardStepDesc}>{description}</p>
      <label className={styles.teamField}>
        <span>Name</span>
        <input
          type="text"
          value={value.name}
          maxLength={200}
          onChange={(e) => setField('name', e.target.value)}
          placeholder="Full name"
        />
      </label>
      <label className={styles.teamField}>
        <span>Phone</span>
        <input
          type="tel"
          value={value.phone}
          maxLength={30}
          onChange={(e) => setField('phone', e.target.value)}
          placeholder="Phone number"
        />
      </label>
      <label className={styles.teamField}>
        <span>Email</span>
        <input
          type="email"
          value={value.email}
          maxLength={150}
          onChange={(e) => setField('email', e.target.value)}
          placeholder="Email address"
        />
      </label>
      <ImageUploadField
        label="Photo"
        value={value.image_url}
        onChange={(url) => setField('image_url', url)}
        uploadPrefix="events"
      />
    </section>
  );
}
