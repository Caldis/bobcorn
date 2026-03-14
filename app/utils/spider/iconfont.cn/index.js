// electron
import { remote } from 'electron';
const electronPath = remote.app.getPath('exe');
// Nightmare
import Nightmare from 'nightmare';
const nightmare = Nightmare({
	gotoTimeout: 10000,
	electronPath: electronPath,
	show: process.env.NODE_ENV === 'development',
	openDevTools: {
		mode: 'detach'
	}
});

// 返回Promise对象, 使用then/catch处理
const spider = (keyword="test", page=1, pageSize=50) => {
	return nightmare.goto(`http://iconfont.cn/`)
		.wait(() => {
			const isg = decodeURIComponent(document.cookie.replace(new RegExp("(?:(?:^|.*;)\\s*" + encodeURIComponent("isg").replace(/[\-\.\+\*]/g, "\\$&") + "\\s*\\=\\s*([^;]*).*$)|^.*$"), "$1")) || null;
			return !!isg;
		})
		.evaluate((keyword, page, pageSize) => {
			return new Promise((resolve, reject) => {
				const ctoken = decodeURIComponent(document.cookie.replace(new RegExp("(?:(?:^|.*;)\\s*" + encodeURIComponent("ctoken").replace(/[\-\.\+\*]/g, "\\$&") + "\\s*\\=\\s*([^;]*).*$)|^.*$"), "$1")) || null;
				if (ctoken) {
					fetch("http://iconfont.cn/api/icon/search.json", {
						method: "POST",
						headers: new Headers({
							"Accept": "application/json, text/javascript, */*; q=0.01",
							"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
						}),
						body: `q=${encodeURIComponent(keyword)}&sortType=updated_at&page=${page}&pageSize=${pageSize}&ctoken=${ctoken}`
					}).then(res => {
						res.json().then(json => {
							resolve({
								count: json.data.count,
								icons: json.data.icons.map(icon => ({
									iconName: icon.name,
									iconType: "svg",
									iconSource: "iconfont.cn",
									iconContent: icon.show_svg
								}))
							});
						});
					}).catch(err => {
						reject(`Fetch错误:　${err}`);
					});
				} else {
					reject("无法获取Token");
				}
			});
		}, keyword, page, pageSize);
};

export default spider;