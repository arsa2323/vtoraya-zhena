import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const records=sqliteTable('records',{id:text('id').primaryKey(),kind:text('kind').notNull(),owner:text('owner').notNull(),data:text('data').notNull(),created:integer('created').notNull()},t=>[index('records_kind_owner').on(t.kind,t.owner)]);
