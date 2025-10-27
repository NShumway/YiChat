export interface Contact {
  userId: string; // UID of the contact
  displayName: string; // Cached display name
  email?: string;
  photoURL?: string;
  relationship?: string; // User-defined relationship (e.g., "coworker", "best friend", "mom")
  addedAt: number;
}
