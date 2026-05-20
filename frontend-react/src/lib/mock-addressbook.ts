export type ContactGroup = {
  id: string;
  name: string;
  contactCount: number;
};

export const CONTACT_GROUPS: ContactGroup[] = [
  { id: "vip", name: "VIP Investors", contactCount: 12 },
  { id: "board", name: "Board Members", contactCount: 5 },
  { id: "prospects", name: "Prospects", contactCount: 34 },
  { id: "partners", name: "Partners", contactCount: 18 },
];
