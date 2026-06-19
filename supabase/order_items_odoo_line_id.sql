-- Stocke l'id de la ligne Odoo (sale.order.line) sur chaque order_item.
-- Permet de relier de façon EXACTE une ligne du récap (sales_lines.odoo_line_id)
-- à son order_item — utilisé pour le « coup de fluo » des CD/GM rangés.
alter table order_items add column if not exists odoo_line_id bigint;
