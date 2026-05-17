// 简易数据加载器，依赖页面已加载 d3
(function(window){
  async function loadCSV(path){
    try{
      const txt = await fetch(path).then(r=>{
        if(!r.ok) throw new Error(r.statusText);
        return r.text();
      });
      return d3.csvParse(txt);
    }catch(e){
      console.error('加载 CSV 出错：', path, e);
      throw e;
    }
  }

  window.dataLoader = { loadCSV };
})(window);
