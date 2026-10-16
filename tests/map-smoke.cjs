const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    for(const viewport of [{width:1440,height:900},{width:390,height:844}]) {
      const page=await browser.newPage({viewport});
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      const start=Date.now();
      const response=await page.goto(process.env.MANCARDO_TEST_URL||'https://mancardo-dev-test.jayfenno.workers.dev/',{waitUntil:'domcontentloaded',timeout:30000});
      assert.ok(response&&response.ok(),'Development URL must return HTTP 2xx');
      const pageInfo=await page.evaluate(()=>({title:document.title,heading:document.querySelector('h1')?.textContent||'',body:document.body?.innerText?.slice(0,600)||'',mapPresent:!!document.querySelector('#mapDiv')}));
      console.log('PAGE_DIAGNOSTIC',JSON.stringify({url:page.url(),httpStatus:response.status(),...pageInfo}));
      if(!pageInfo.mapPresent){
        throw new Error('Mancardo map DOM absent. Likely auth gate, redirect, or wrong deployment. See PAGE_DIAGNOSTIC.');
      }
      await page.locator('#mapDiv').waitFor({state:'visible',timeout:20000});
      await page.waitForFunction(()=>document.querySelector('#mapDiv')?.clientWidth>100&&document.querySelector('#mapDiv')?.clientHeight>100,null,{timeout:10000});
      const renderMs=Date.now()-start;
      assert.ok(renderMs<30000,'Map initial render exceeded 30 seconds: '+renderMs);
      const box=await page.locator('#mapDiv').boundingBox();
      assert.ok(box&&box.width>100&&box.height>100,'Map must occupy a usable viewport');
      await page.locator('#mapDiv').hover({position:{x:Math.floor(box.width/2),y:Math.floor(box.height/2)}});
      const zoomStart=Date.now();
      await page.mouse.wheel(0,-450);
      await page.waitForTimeout(1000);
      const zoomMs=Date.now()-zoomStart;
      assert.ok(zoomMs<5000,'Map wheel interaction timed out');
      assert.equal(errors.length,0,'Uncaught browser exceptions: '+errors.join(' | '));
      console.log(JSON.stringify({viewport,renderMs,zoomMs,mapWidth:box.width,mapHeight:box.height,pageErrors:errors}));
      await page.close();
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
