

# LearnXchange — Full Build Plan

## Overview
LearnXchange is a web platform where users can buy, sell, and exchange learning resources. All users share one unified role — their actions (buying, selling, exchanging) determine their experience. The platform features file uploads for course materials, a dashboard-first design, and a modern UI blending clean, colorful, and professional aesthetics.

---

## Phase 1: Foundation & Authentication

### 1.1 Design System & Layout
- Modern, polished UI with a clean layout, vibrant accent colors, and professional structure
- Sidebar navigation with collapsible menu
- Responsive design for mobile and desktop
- Pages: Landing, Login, Register, Dashboard, Course Detail, Profile

### 1.2 Landing Page
- Hero section with bold headline and call-to-action
- Feature highlights (Buy, Sell, Exchange)
- How it works section
- Footer with links

### 1.3 Authentication (Supabase)
- Email + password registration (full name, email, password)
- Email verification required before login
- Login page with redirect to dashboard
- Protected routes for authenticated users

### 1.4 User Profiles
- Profiles table linked to auth.users
- Auto-created on signup via database trigger
- Fields: full name, email, avatar (Supabase Storage), reputation score, created_at
- Profile edit page with avatar upload

---

## Phase 2: Course Management

### 2.1 Create & Manage Courses
- Course creation form: title, description, price, category, availability type (for sale / for exchange / both)
- File upload for course materials (PDFs, videos, docs, PPTs) via Supabase Storage (20MB limit per file)
- Course thumbnail/cover image upload
- Edit and delete own courses
- Course listing page with search and filters

### 2.2 Course Detail Page
- Full course info display
- Buy button and Exchange request button (UI ready for future payment integration)
- Seller profile card with reputation
- Related courses section

### 2.3 Browse & Discover
- Public course catalog with grid/list view
- Filter by category, price range, availability type
- Search by title/description
- Sort by newest, price, rating

---

## Phase 3: Dashboard

### 3.1 User Dashboard
- Three-tab layout: **Bought**, **Sold**, **Exchanged**
- Each tab shows relevant courses with title, other party, transaction type, date, and status
- Quick stats cards (total bought, sold, exchanged, earnings)
- Recent activity feed

### 3.2 My Courses Section
- List of courses the user has created
- Status indicators (active, sold, exchanged)
- Quick edit/delete actions

---

## Phase 4: Transactions & Exchanges

### 4.1 Purchase Flow
- Buy button on course detail page
- Transaction record created (buyer, seller, course, amount, date)
- Course appears in buyer's "Bought" tab and seller's "Sold" tab
- No real payment processing yet — transactions are recorded for future payment integration

### 4.2 Exchange System
- Exchange request: user selects one of their courses to offer
- Course owner receives exchange requests with details
- Accept/reject exchange requests
- On acceptance: both courses swap, records stored in both users' "Exchanged" tabs

### 4.3 Transaction History
- Full history page showing all buy/sell/exchange transactions
- Filterable by type and date

---

## Phase 5: Ratings & Reputation

### 5.1 Rating System
- After a completed transaction (buy, sell, or exchange), users can rate the other party (1–5 stars + optional comment)
- Duplicate rating prevention (one rating per transaction)
- Ratings visible on user profiles

### 5.2 Reputation Score
- Automatically calculated from average ratings
- Displayed on profile and seller cards

---

## Phase 6: Security & Data

### 6.1 Database (Supabase)
- Tables: profiles, courses, transactions, exchanges, ratings
- Row-Level Security (RLS) on all tables — users can only manage their own content
- Supabase Storage buckets for avatars and course materials

### 6.2 Authorization
- Ownership-based access control via RLS
- Protected API calls for all mutations

---

## Future-Ready
- Buy/Sell buttons and transaction UI designed to easily plug in Stripe or other payment gateways
- Architecture supports adding messaging, AI recommendations, and mobile app later

