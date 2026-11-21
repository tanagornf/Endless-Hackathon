import { defineFeaturePages } from '../../core';
export default defineFeaturePages({featureId:'F14',slug:'payments',routes:[
  {path:'/payments',permission:'orders.read',titleKey:'payments:page.title',load:()=>import('./PaymentsPage')},
  {path:'/payments/pay/:token',auth:'none',layout:'public',titleKey:'payments:pay.title',load:()=>import('./PublicPayment')},
],menu:[{path:'/payments',group:'commerce',labelKey:'payments:menu.title',icon:'PaymentsOutlined',order:20,permission:'orders.read',
  searchTerms:['payment','ชำระเงิน','สลิป','promptpay','qr']} ]});
