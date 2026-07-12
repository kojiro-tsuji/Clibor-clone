export namespace db {
	
	export class Category {
	    id: number;
	    name: string;
	    sort_order: number;
	
	    static createFrom(source: any = {}) {
	        return new Category(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.sort_order = source["sort_order"];
	    }
	}
	export class Phrase {
	    id: number;
	    category_id: number;
	    title: string;
	    content: string;
	    sort_order: number;
	
	    static createFrom(source: any = {}) {
	        return new Phrase(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.category_id = source["category_id"];
	        this.title = source["title"];
	        this.content = source["content"];
	        this.sort_order = source["sort_order"];
	    }
	}

}

