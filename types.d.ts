// TypeScript types for KDB frontend data contracts

export type PageName = 'home' | 'nosotros' | 'servicios' | 'productos' | 'publicaciones';

export interface Company {
  id?: number;
  name?: string;
  tagline?: string;
  phone?: string;
  email?: string;
  address?: string;
  linkedin?: string;
  facebook?: string;
  instagram?: string;
}

export interface HeroSlide {
  id?: number;
  page: PageName | string;
  position: number;
  title?: string;
  description?: string;
  primary_label?: string;
  primary_href?: string;
  secondary_label?: string;
  secondary_href?: string;
  image_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Story {
  page?: PageName | string;
  title?: string;
  paragraphs?: string[];
  html?: string; // frontend alias for content_html
  content_html?: string;
}

export interface About {
  page?: PageName | string;
  title?: string;
  content?: string; // plain text or HTML
  content_lines?: string[]; // frontend may split into lines
  image_url?: string;
  primary_label?: string;
  primary_href?: string;
  secondary_label?: string;
  secondary_href?: string;
}

export interface TeamMember {
  id?: number;
  page?: PageName | string;
  position?: number;
  name?: string;
  role?: string;
  image_url?: string;
  linkedin?: string;
  more_url?: string;
}

export interface TeamMeta {
  page?: PageName | string;
  title?: string;
  subtitle?: string;
}

export interface ServiceItem {
  id?: number;
  page?: PageName | string;
  position?: number;
  title?: string;
  description?: string;
  bullets?: string[];
}

export interface ServicesMeta {
  page?: PageName | string;
  title?: string;
  subtitle?: string;
}

export interface Category {
  id?: number;
  name?: string;
}

export interface Publication {
  id?: number;
  title: string;
  slug: string;
  excerpt?: string;
  content_html?: string;
  category_id?: number | null;
  category?: string;
  published_at?: string;
}

export interface PageData {
  hero?: HeroSlide[];
  story?: Story;
  team?: TeamMember[];
  about?: About;
  team_meta?: TeamMeta;
  services?: ServiceItem[];
  services_meta?: ServicesMeta;
  publications?: Publication[];
}

export interface Subscription {
  id?: number;
  email: string;
  created_at?: string;
}

// Utility: typed API client contract
export interface ApiClient {
  getCompany?: () => Promise<Company>;
  getPage?: (page: PageName | string) => Promise<PageData>;
  subscribe?: (email: string) => Promise<any>;
}
