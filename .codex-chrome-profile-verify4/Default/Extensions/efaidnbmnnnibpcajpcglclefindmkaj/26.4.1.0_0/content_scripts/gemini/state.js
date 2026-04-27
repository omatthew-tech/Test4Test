/*************************************************************************
* ADOBE CONFIDENTIAL
* ___________________
*
*  Copyright 2015 Adobe Systems Incorporated
*  All Rights Reserved.
*
* NOTICE:  All information contained herein is, and remains
* the property of Adobe Systems Incorporated and its suppliers,
* if any.  The intellectual and technical concepts contained
* herein are proprietary to Adobe Systems Incorporated and its
* suppliers and are protected by all applicable intellectual property laws,
* including trade secret and or copyright laws.
* Dissemination of this information or reproduction of this material
* is strictly forbidden unless prior written permission is obtained
* from Adobe Systems Incorporated.
**************************************************************************/
const lruChatLoadedData=new Map,DEFAULT_MAX_LRU_SIZE=1e3,abortController=new AbortController,state={config:{},geminiResponseInterceptorAdded:!1,getLRUData(a){if(!lruChatLoadedData.has(a))return null;const t=lruChatLoadedData.get(a);return lruChatLoadedData.delete(a),lruChatLoadedData.set(a,t),t},setLRUData(a,t){const e=state.config?.maxLRUSizeForChatLoadedData||1e3;if(lruChatLoadedData.has(a))lruChatLoadedData.delete(a);else if(lruChatLoadedData.size===e){const a=lruChatLoadedData.keys().next().value;lruChatLoadedData.delete(a)}lruChatLoadedData.set(a,t)},get eventControllerSignal(){return abortController.signal},disconnectEventListeners(){abortController?.abort()}};export default state;