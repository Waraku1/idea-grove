function load(factory){
  let initialized=false;
  let value;
  return function(){
    if(!initialized){
      const exports = {};
      const module = { exports };
      const result = factory(exports, module);
      value = module.exports === exports ? (result === undefined ? exports : result) : module.exports;
      initialized=true;
    }
    return value;
  };
}
export { load as t, load as r };
