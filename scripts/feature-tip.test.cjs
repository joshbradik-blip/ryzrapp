const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const babel = require('@babel/core');
const React = require('react');
const { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;

test('tips show one at a time, require Got it, and remember acknowledgment', async () => {
  const values = new Map();
  const intervals = new Set();
  const native = {
    View: React.forwardRef((props, ref) => {
      React.useImperativeHandle(ref, () => ({ measureInWindow: (callback) => callback(30, 200, 300, 70) }));
      return React.createElement('View', props, props.children);
    }),
    Modal: 'Modal', Text: 'Text', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity',
    useWindowDimensions: () => ({ width: 400, height: 800 }),
  };
  const originalLoad = Module._load;
  const originalInterval = global.setInterval;
  const originalClear = global.clearInterval;
  let tree;
  try {
    Module._load = function(name, parent, ...rest) {
      if(name === 'react-native') return native;
      if(name === '@react-native-async-storage/async-storage') return { getItem: async (key) => values.get(key), setItem: async (key, value) => values.set(key, value) };
      if(name === '@react-navigation/native') return { useIsFocused: () => true };
      if(name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 24, bottom: 24 }) };
      if(name === '../../constants/theme') return { Colors: { text: '#fff', primary: '#f60' } };
      return originalLoad.call(this,name,parent,...rest);
    };
    global.setInterval = (callback) => { intervals.add(callback); return callback; };
    global.clearInterval = (callback) => intervals.delete(callback);
    const file = require('node:path').resolve('src/components/ui/FeatureTip.tsx');
    const code = babel.transformSync(fs.readFileSync(file,'utf8'), {
      filename: file, configFile:false,babelrc:false,
      presets:[['@babel/preset-typescript',{allExtensions:true,isTSX:true}]],
      plugins:[['@babel/plugin-transform-react-jsx',{runtime:'automatic'}],'@babel/plugin-transform-modules-commonjs'],
    }).code;
    const mod = new Module(file,module); mod.filename=file;mod.paths=module.paths; mod._compile(code,file);
    const Tip = mod.exports.FeatureTip;
    await act(async () => { tree=create(React.createElement(React.Fragment,null,
      React.createElement(Tip,{id:'one',title:'First',message:'Explain'},'Target one'),
      React.createElement(Tip,{id:'two',title:'Second',message:'Explain'},'Target two'))); });
    const visible=()=>tree.root.findAllByType('Modal').filter((node)=>node.props.visible);
    await act(async()=>{ for(const tick of intervals) tick(); });
    assert.equal(visible().length,1);
    await act(async()=>visible()[0].props.onRequestClose());
    assert.equal(visible().length,1,'Android back must not skip acknowledgment');
    await act(async()=>visible()[0].findByType('TouchableOpacity').props.onPress());
    assert.equal(values.get('feature-tip-v1:one'),'seen');
    await act(async()=>{ for(const tick of intervals) tick(); });
    assert.equal(visible().length,1);
    assert.equal(visible()[0].findAllByType('Text')[0].props.children,'Second');
    await act(async()=>visible()[0].findByType('TouchableOpacity').props.onPress());
    await act(async()=>{ for(const tick of intervals) tick(); });
    assert.equal(visible().length,0);
    await act(async()=>tree.unmount());
    await act(async()=>{ tree=create(React.createElement(React.Fragment,null,
      React.createElement(Tip,{id:'one',title:'First again',message:'Explain'},'First copy'),
      React.createElement(Tip,{id:'one',title:'Duplicate',message:'Explain'},'Second copy'))); });
    await act(async()=>{ for(const tick of intervals) tick(); });
    assert.equal(visible().length,0,'seen features stay acknowledged across remounts and duplicate targets');
  } finally {
    if(tree) await act(async()=>tree.unmount());
    Module._load=originalLoad;global.setInterval=originalInterval;global.clearInterval=originalClear;
  }
});
