// src/module.ts
var e;
(function(e) {
	let t;
	(function(e) {
		let t;
		(function(e) {
			class t {}
			e.Module = t;
			function n() {
				return console.log("Core initialized."), new t();
			}
			e.Init = n;
		})(t ||= e.Admin ||= {});
	})(t ||= e.Layouts ||= {});
})(e ||= {});
var t = e.Layouts.Admin.Init;
export { t as default };

//# sourceMappingURL=module.js.map