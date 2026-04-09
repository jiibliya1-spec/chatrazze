# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Includes a WhatsApp-like chat app (WhatChat) built with React Native (Expo) and Supabase.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM (shared API server), Supabase (mobile app)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Chatraze Mobile App (artifacts/chat-app)

A WhatsApp-like chat application built with:
- **Frontend**: React Native + Expo Router
- **Backend**: Supabase (Auth, Database, Realtime, Storage)
- **Authentication**: Phone OTP via Supabase Auth
- **Real-time**: Supabase Realtime subscriptions

### Features
- Phone number login with OTP verification
- Real-time messaging (text, image, audio types)
- Message status (sent, delivered, read)
- Online/offline status and last seen
- Typing indicator
- Dark mode support
- Message deletion
- Contact search

### Setup Required
Run `artifacts/chat-app/supabase-schema.sql` in your Supabase SQL editor to create all tables and RLS policies.

### Environment Variables
- `EXPO_PUBLIC_SUPABASE_URL` - Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
