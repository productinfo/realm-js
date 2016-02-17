/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 */
'use strict';
import React, {
    AppRegistry,
    Component,
    StyleSheet,
    Text,
    View,
    ListView,
    TouchableHighlight
} from 'react-native';

const Store = require('react-native-store');
const SQLite = require('react-native-sqlite-storage');
const Realm = require('realm');

// Make SQLite module use Promises.
SQLite.enablePromise(true);

const TestObjectSchema = {
    name: "TestObject",
    properties: {
        int: "int",
        double: "double",
        date: "date",
        string: "string"
    }
}

const numTestObjects = 100;
const numBatchTestObjects = numTestObjects * 1000;
const numRepeats = 1;
const numQueryBuckets = 100;

const tests = ["insertions", "binsertions", "enumeration", "querycount", "queryenum"];
const expectedCounts = {
    insertions: numTestObjects, 
    binsertions: numBatchTestObjects, 
    enumeration: numBatchTestObjects, 
    querycount: numBatchTestObjects, 
    queryenum: numBatchTestObjects
};
const expectedResults = {
    insertions: numTestObjects, 
    binsertions: numBatchTestObjects, 
    enumeration: numBatchTestObjects, 
    querycount: numBatchTestObjects / (numQueryBuckets * 2), 
    queryenum: numBatchTestObjects / (numQueryBuckets * 2)
};

class Tests {
    async setup(testName) {
        var count = await this.count();
        if (testName == 'enumeration' || testName == 'querycount' || testName == 'queryenum') {
            if (count != expectedCounts[testName]) {
                throw "Incorrect count " + count + " for test " + testName;
            }
        }
        else {
            if (count !=  0) {
                throw "Initial count should be 0 for insertion tests";
            }
        }
    }

    async binsertions() {
        return await this.batchInsert(this.testObjects(numBatchTestObjects));
    }

    objectValues(object) {
         return Object.keys(TestObjectSchema.properties).map((prop) => object[prop])
    }

    testObjects(count) {
        var objects = [];
        for (let i = 0; i < count; i++) {
            objects.push({ int: i % numQueryBuckets, double: i, date: new Date(i), string: "" + i });
        }
        return objects;
    }
}

class RealmTests extends Tests {
    constructor() {
        super();
        this.name = 'Realm';
    }

    async setup(testName) {
        if (testName == "insertions" || testName == "binsertions") {
            Realm.clearTestState();
        }
        this.realm = new Realm({schema: [TestObjectSchema]});

        await super.setup(testName);
    }

    async insertions() {
        var realm = this.realm;
        var objects = this.testObjects(numTestObjects);
        for (var i = 0; i < objects.length; i++) {
            var obj = objects[i];
            realm.write(() => {
                realm.create("TestObject", obj);
            });
        }
        return numTestObjects;
    }

    async batchInsert(objects) {
        var realm = this.realm;
        realm.write(() => {
            for (var i = 0; i < objects.length; i++) {
                var obj = objects[i];
                realm.create("TestObject", obj);
            }
        });
        return objects.length;
    }

    async enumeration() {
        let objects = this.realm.objects('TestObject');
        let len = objects.length;
        for (let i = 0; i < len; i++) {
            var obj = objects[i];
            obj.int;
            obj.double;
            obj.date;
            obj.string;
        }
        return len;
    }

    async querycount() {
        let objects = this.realm.objects('TestObject', 'int = 0 and double < ' + numBatchTestObjects / 2);
        return objects.length;
    }

    async queryenum() {
        let objects = this.realm.objects('TestObject', 'int = 0 and double < ' + numBatchTestObjects / 2);
        let len = objects.length;
        for (let i = 0; i < len; i++) {
            var obj = objects[i];
            obj.int;
            obj.double;
            obj.date;
            obj.string;
        }        
        return len;
    }

    async count() {
        return this.realm.objects('TestObject').length;
    }
}

class RNStoreTests extends Tests {
    constructor() {
        super();
        this.name = "RNStore";
    }

    async setup(testName) {
        this.db = Store.model('objects');
        if (testName == "insertions" || testName == "binsertions") {
            await this.db.destroy();
        }

        await super.setup(testName);
    }

    async insertions() {
        var objects = this.testObjects(numTestObjects);
        for (var i = 0; i < objects.length; i++) {
            var obj = objects[i];
            obj.date = obj.date.getTime();
            await this.db.add(obj);
        }
        return numTestObjects;
    }

    async batchInsert(objects) {
        await this.db.multiAdd(objects);
        for (var i = 0; i < objects.length; i++) {
            var obj = objects[i];
            obj.date = obj.date.getTime();
        }
        return objects.length;
    }

    async enumeration() {
        let objects = await this.db.find();
        let len = objects.length;
        for (let i = 0; i < len; i++) {
            var obj = objects[i];
            obj.int;
            obj.double;
            new Date(obj.date);
            obj.string;
        }
        return len;
    }

    async querycount() {
        let objects = await this.db.find({
            where: {
                and: [{ int: 0 }, { double: { lt: numBatchTestObjects / 2 } }]
            },
            order: {
                age: 'ASC',
            }
        });
        return objects.length;
    }

    async queryenum() {
        let objects = await this.db.find({
            where: {
                and: [{ int: 0 }, { double: { lt: numBatchTestObjects / 2 } }]
            },
            order: {
                age: 'ASC',
            }
        });
        let len = objects.length;
        for (let i = 0; i < len; i++) {
            var obj = objects[i];
            obj.int;
            obj.double;
            obj.date;
            obj.string;
        }
        return len
    }

    async count() {
        let objects = await this.db.find();
        return objects != undefined ? objects.length : 0;
    }
}

class RNSqliteTests extends Tests {
    constructor() {
        super();
        this.name = "RNSqlite";
    }

    async setup(testName) {
        if (testName == "insertions" || testName == "binsertions") {
            try {
                await SQLite.deleteDatabase('test.db');
            } catch (e) {}
        }
        this.db = await SQLite.openDatabase("test.db", "1.0", "Test Database", 200000);

        await this.db.transaction((tx) => {
            tx.executeSql('CREATE TABLE IF NOT EXISTS t1 (string VARCHAR(100), int INTEGER, double REAL, date INTEGER);');
        });

        await super.setup(testName);
    }

    async insertions() {
        var objects = this.testObjects(numTestObjects);
        for (var i = 0; i < objects.length; i++) {
            var obj = objects[i];
            let values = [obj.string, obj.int, obj.double, obj.date.getTime()];
            await this.db.transaction((tx) => {
                tx.executeSql('INSERT INTO t1 (string, int, double, date) VALUES (?,?,?,?);', values);
            });
        }
        return numTestObjects;
    }

    async batchInsert(objects) {
        await this.db.transaction((tx) => {
            for (var i = 0; i < objects.length; i++) {
                var obj = objects[i];
                let values = [obj.string, obj.int, obj.double, obj.date.getTime()];
                tx.executeSql('INSERT INTO t1 (string, int, double, date) VALUES (?,?,?,?);', values);
            }
        });
        return objects.length;
    }

    async enumeration() {
        var len;
        await this.db.readTransaction(async (tx) => {
            let [, results] = await tx.executeSql('SELECT * FROM t1;')
            len = results.rows.length;
            for (let i = 0; i < len; i++) {
                var row = results.rows.item(i);
                row.int;
                row.double;
                row.string;
                new Date(row.date);
            }
        });
        return len;
    }

    async querycount() {
        var len;
        await this.db.readTransaction(async (tx) => {
            let [, results] = await tx.executeSql('SELECT * FROM t1 WHERE int = 0 AND double < ' + numBatchTestObjects/2 + ';');            
            len = results.rows.length;
        });
        return len;
    }

    async queryenum() {
        var len;
        await this.db.readTransaction(async (tx) => {
            let [, results] = await tx.executeSql('SELECT * FROM t1 WHERE int = 0 AND double < ' + numBatchTestObjects/2 + ';');            
            len = results.rows.length;
            for (let i = 0; i < len; i++) {
                var row = results.rows.item(i);
                row.int;
                row.double;
                row.string;
                new Date(row.date);
            }
        });
        return len;
    }

    async count() {
        var len;
        await this.db.readTransaction(async (tx) => {
            let [, results] = await tx.executeSql('SELECT * FROM t1;')
            len = results.rows.length;
        });
        return len;
    }
}

const apiTests = [new RealmTests, new RNSqliteTests, new RNStoreTests];

class ReactNativeBenchmarks extends Component {
    constructor(props) {
        super(props);

        this.state = {
            dataSource: new ListView.DataSource({
                rowHasChanged: (row1, row2) => row1 !== row2,
            }),
            running: false,
        };

        this._renderRow = this._renderRow.bind(this);
        this._runTests = this._runTests.bind(this);
    }

    render() {
        return (
            <View style={styles.container}>
                <Text style={styles.title}>
                    ReactNative Storage Benchmarks
                </Text>
                <TouchableHighlight style={styles.button} onPress={this._runTests}>
                    <Text style={styles.buttonText}>
                        Run
                    </Text>
                </TouchableHighlight>
                <ListView contentContainerStyle={styles.list}
                    dataSource={this.state.dataSource}
                    renderRow={this._renderRow}
                />
            </View>
        );
    }

    _renderRow(rowData) {
        return (
            <Text style={styles.item}>{rowData.join('\t\t')}</Text>
        );
    }

    async _runTests() {
        if (this.state.running) {
            console.log("DISABLED");
            return;
        }

        this.setState({running: true});

        try {
            await this._runTestsAsync();
        } catch (e) {
            console.error('Error running tests:', e);
        }

        this.setState({running: false});
    }

    async _runTestsAsync() {
        var data = [apiTests.map((api) => api.name)];
        data[0].splice(0, 0, "\t\t");
        for (var i = 0; i < tests.length; i++) {
            var test = tests[i];
            data.push([test]);
            this.setState({
                dataSource: this.state.dataSource.cloneWithRows(data),
            });

            for (var j = 0; j < apiTests.length; j++) {
                var apiTest = apiTests[j];
                var totalTime = 0;
                console.log("Running " + apiTest.name + "." + test);
                for (var k = 0; k < numRepeats; k++) {
                    await apiTest.setup(test);

                    var startTime = Date.now();
                    var result = await apiTest[test]();
                    var endTime = Date.now();

                    if (result != expectedResults[test]) {
                        throw "Incorrect result " + result + " for test " + apiTest.name + "." + test;
                    }

                    var count = await apiTest.count();
                    if (count != expectedCounts[test]) {
                        throw "Incorrect count " + count + " for test " + apiTest.name + "." + test;
                    }

                    var time = endTime - startTime
                    console.log("finished in " + time);
                    totalTime += time;
                }

                data = data.slice();
                let last = data.length-1;
                data[last] = data[last].slice();
                data[last].push(totalTime / numRepeats);

                this.setState({
                    dataSource: this.state.dataSource.cloneWithRows(data),
                });      
            }
        }
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F5FCFF',
    },
    title: {
        fontSize: 20,
        textAlign: 'center',
        margin: 20,
    },
    instructions: {
        textAlign: 'center',
        color: '#333333',
        marginBottom: 5,
    },
    list: {
        justifyContent: 'center',
        flexDirection: 'column',
        flexWrap: 'wrap',
    },
    button: {
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#CCC',
        width: 100,
        height: 40 
    },
    row: {
        flexDirection: 'row',
    },
    item: {
        textAlign: 'center',
        padding: 3,
        margin: 3,
        fontSize: 12
    }
});

module.exports = ReactNativeBenchmarks;
