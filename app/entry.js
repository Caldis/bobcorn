// antd 5 uses CSS-in-JS, no separate CSS import needed

// Patch: sql.js 0.5.0 Emscripten code does:
//   Object.defineProperty(this, "stack", {value: (new Error).stack})  // writable defaults to false
//   FS.genericErrors[code].stack = "..."  // fails because writable is false
// Fix by wrapping Object.defineProperty to force writable:true for 'stack' props.
(function patchErrorStack() {
  const _origDefineProperty = Object.defineProperty;
  Object.defineProperty = function(obj, prop, desc) {
    if (prop === 'stack' && desc && 'value' in desc && !desc.writable) {
      desc = Object.assign({}, desc, { writable: true, configurable: true });
    }
    try {
      return _origDefineProperty.call(Object, obj, prop, desc);
    } catch(e) {
      if (prop === 'stack') return obj;
      throw e;
    }
  };
})();

// Styles
import './index.global.css';
// Bootstrap the app
import('./bootstrap.jsx');
