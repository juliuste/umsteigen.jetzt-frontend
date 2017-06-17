'use strict'

const api = {
	url: 'https://transport.rest/locations',
	adapter: (res) => res.map((e) => e.name)
}
const autocomplete = require('horsey')
const fetch = require('fetch-ponyfill')().fetch
const querystring = require('querystring').stringify
const moment = require('moment-timezone')
const clone = require('clone')
const roundTo = require('round-to')
const numSort = require('num-sort')

const round = (e) => roundTo(e, 2)
const toGermanNo = (e) => (e+'').split('.').join(',')

autocomplete(document.querySelector('#origin'), {
	suggestions: (value, done) => {
		fetch(api.url+'?'+querystring({query: value}), {
			method: "get",
			mode: "cors"
		}).then((r) => r.json()).then(api.adapter).then((res) => done(res))
	},
	limit: 5,
	appendTo: document.querySelector('#originContainer'),
	autoHideOnClick: true,
	autoHideOnBlur: true
})

autocomplete(document.querySelector('#destination'), {
	suggestions: (value, done) => {
		fetch(api.url+'?'+querystring({query: value}), {
			method: "get",
			mode: "cors"
		}).then((r) => r.json()).then(api.adapter).then((res) => done(res))
	},
	limit: 5,
	appendTo: document.querySelector('#destinationContainer'),
	autoHideOnClick: true,
	autoHideOnBlur: true
})

document.querySelector('#origin').addEventListener('horsey-selected', () => document.querySelector('#destination').focus())
document.querySelector('#destination').addEventListener('horsey-selected', () => document.querySelector('#los').focus())

const countDays = (d) => {
	let c = 0
	for(let day in d){
		if(d[day]) c++
	}
	return c
}

const checkParams = () => {
	const origin = document.querySelector('#origin').value
	const destination = document.querySelector('#destination').value
	const time = document.querySelector('#time').value
	const abAn = document.querySelector('input[name="ab-an"]:checked').value
	const days = {
		mo: document.querySelector('#mo').checked,
		di: document.querySelector('#di').checked,
		mi: document.querySelector('#mi').checked,
		do: document.querySelector('#do').checked,
		fr: document.querySelector('#fr').checked,
		sa: document.querySelector('#sa').checked,
		so: document.querySelector('#so').checked
	}
	if(
		!origin
	||	!destination
	||	!time
	||	time.length!=5
	||	['ab', 'an'].indexOf(abAn)<0
	||	countDays(days)===0
	) return false
	else return ({
		origin,
		destination,
		time,
		abAn,
		days
	})
}

const formatParams = (p) => {
	return Promise.all([
		fetch(api.url+'?'+querystring({query: p.origin}), {
			method: "get",
			mode: "cors"
		}).then((r) => r.json()),
		fetch(api.url+'?'+querystring({query: p.destination}), {
			method: "get",
			mode: "cors"
		}).then((r) => r.json())
	])
	.then(([o, d]) => [o[0], d[0]])
	.then(([o, d]) => ({
		origin: {
			latitude: o.latitude,
			longitude: o.longitude
		},
		destination: {
			latitude: d.latitude,
			longitude: d.longitude
		},
		time: {
			type: (p.abAn === 'ab') ? 'departure' : 'arrival',
			value: +(moment.tz(p.time, 'HH:mm', 'Europe/Berlin').day(9))
		}
	}))
	.then((res) => {
		const result = []
		for(let i=0; i<countDays(p.days); i++){
			result.push(res)
		}
		return result
	})
	.then((req) =>
		fetch('https://api.umsteigen.jetzt/', {
			method: "post",
			mode: "cors",
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({routes: req})
		})
	)
	.then((res) => res.json())
}

const clearTable = () => {
	Array.from(document.querySelectorAll('.entry')).map((el) => {el.innerHTML=''; el.setAttribute('class', 'entry')})
}

const units = {
	'duration': ' h',
	'calories': ' kcal',
	'greenhouse': ' kg',
	'price': ' €',
	'risk': ' ‰ / a'
}

const formatData = (d) => {
	const e = clone(d)
	for(let type in e){
		e[type]['duration'] = Math.round(e[type]['duration'] / (1000 * 60 * 60))
		e[type]['greenhouse'] = round(e[type]['greenhouse']/1000)
		e[type]['calories'] = Math.round(e[type]['calories'])
		e[type]['price'] = Math.round(e[type]['price'])
		e[type]['risk'] = round(e[type]['risk'])
	}
	return e
}

const getExtrema = (d) => {
	const values = {
		calories: [],
		greenhouse: [],
		price: [],
		duration: [],
		risk: []
	}
	for(let type in d){
		for(let column in d[type]) values[column].push(d[type][column])
	}
	for(let key in values){
		values[key] = values[key].sort(numSort.asc)
		values[key] = {
			min: values[key][0],
			max: values[key][values[key].length-1]
		}
	}
	return values
}

const enterData = (d) => {
	clearTable()
	d = formatData(d)
	const extr = getExtrema(d)
	for(let type in d){
		for(let column in d[type]){
			if(
				(d[type][column]===extr[column].max && column==='calories')
			||	(d[type][column]===extr[column].min && ['price', 'duration', 'greenhouse', 'risk'].indexOf(column)>=0)
			) document.querySelector(`#${type}-${column}`).setAttribute('class', 'entry best')
			else if(
				(d[type][column]===extr[column].min && column==='calories')
			||	(d[type][column]===extr[column].max && ['price', 'duration', 'greenhouse', 'risk'].indexOf(column)>=0)
			) document.querySelector(`#${type}-${column}`).setAttribute('class', 'entry worst')
			else document.querySelector(`#${type}-${column}`).setAttribute('class', 'entry average')
			document.querySelector(`#${type}-${column}`).innerHTML = toGermanNo(d[type][column])+units[column]
		}
	}
}

const start = () => {
	document.querySelector('#page2').style.display='none'
	const params = checkParams()
	if(!params){
		document.querySelector('#error').innerHTML = 'Bitte füllen Sie alle Felder aus.'
	}
	else{
		document.querySelector('#error').innerHTML = '&nbsp;'

		formatParams(params)
		.then(enterData)
		.then(() => {
			document.querySelector('#page2').style.display='flex'
			document.querySelector('#page2').scrollIntoView({
  				behavior: 'smooth'
			})
		})
		.catch(() => {
			document.querySelector('#page2').style.display='none'
			document.querySelector('#error').innerHTML = 'Bitte füllen Sie alle Felder aus.'
		})
	}
}

document.querySelector('#los').addEventListener('click', start)
// const h = require('hyperscript')

// const generateRoute = () =>
// 	h('div.route',
// 		h('div.inputGroup',
// 			h('input.origin', {type: 'text', placeholder: 'Start'}),
// 			h('input.destination', {type: 'text', placeholder: 'Ziel'})
// 		),
// 		h('div.inputGroup',
// 			h('label',
// 				h('input.an-ab', {type: 'radio', value: 'an', selected: true}),
// 				h('span', 'An')
// 			),
// 			h('label',
// 				h('input.an-ab', {type: 'radio', value: 'ab'}),
// 				h('span', 'Ab')
// 			)
// 		),
// 		h('div.inputGroup',
// 			h('label',
// 				h('input.day', {type: 'checkbox'}),
// 				h('span', 'Mo')
// 			),
// 			h('label',
// 				h('input.day', {type: 'checkbox'}),
// 				h('span', 'Di')
// 			),
// 			h('label',
// 				h('input.day', {type: 'checkbox'}),
// 				h('span', 'Mi')
// 			),
// 			h('label',
// 				h('input.day', {type: 'checkbox'}),
// 				h('span', 'Do')
// 			),
// 			h('label',
// 				h('input.day', {type: 'checkbox'}),
// 				h('span', 'Fr')
// 			),
// 			h('label',
// 				h('input.day', {type: 'checkbox'}),
// 				h('span', 'Sa')
// 			),
// 			h('label',
// 				h('input.day', {type: 'checkbox'}),
// 				h('span', 'So')
// 			)
// 		),
// 		h('div.inputGroup',
// 			h('a#addRoute', {href: '#'}, '❌')
// 		)
// 	)

// const addRoute = () => document.getElementById('routes').appendChild(generateRoute())

// const removeRoute = (el) => el.parentElement.parentElement.remove()

// Array.from(document.getElementsByClassName('removeRoute')).map((e) => e.addEventListener('click', (el) => removeRoute(el.target)))

// document.getElementById('addRoute').addEventListener('click', addRoute)

