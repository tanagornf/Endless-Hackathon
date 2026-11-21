import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: 'F08',
  slug: 'catalog',
  routes: [
    { path: '/catalog', permission: 'product.read', titleKey: 'catalog:page.title', load: () => import('./CatalogListPage') },
    { path: '/catalog/:itemId', permission: 'product.read', titleKey: 'catalog:page.title', load: () => import('./CatalogEditPage') },
  ],
  menu: [{
    path: '/catalog', group: 'knowledge', labelKey: 'catalog:menu.title', icon: 'Inventory2Outlined',
    order: 30, permission: 'product.read', searchTerms: ['catalog', 'product', 'สินค้า', 'บริการ', 'ราคา'],
  }],
});
