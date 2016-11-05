#include "item.hpp"
#include "item_value.hpp"
#include <v8pp/class.hpp>
#include <v8pp/object.hpp>
#include <vector>

using namespace v8;

class Item::Private {
public:
  std::string name;
  std::string id;
  std::string range;
  ItemValue value;
  std::vector<Item> items;
  std::unordered_map<std::string, ItemValue> attrs;
};

Item::Item() : d(new Private()) {}

Item::Item(const v8::FunctionCallbackInfo<v8::Value> &args) : Item(args[0]) {}

Item::Item(v8::Local<v8::Value> value) : d(new Private()) {
  Isolate *isolate = Isolate::GetCurrent();
  if (!value.IsEmpty() && value->IsObject()) {
    v8::Local<v8::Object> obj = value.As<v8::Object>();
    v8pp::get_option(isolate, obj, "name", d->name);
    v8pp::get_option(isolate, obj, "id", d->id);
    v8pp::get_option(isolate, obj, "range", d->range);

    v8::Local<v8::Value> value;
    if (v8pp::get_option(isolate, obj, "value", value)) {
      if (ItemValue *iv =
              v8pp::class_<ItemValue>::unwrap_object(isolate, value)) {
        d->value = *iv;
      } else {
        d->value = ItemValue(value);
      }
    }

    v8::Local<v8::Array> items;
    if (v8pp::get_option(isolate, obj, "items", items)) {
      for (uint32_t i = 0; i < items->Length(); ++i) {
        v8::Local<v8::Value> item = items->Get(i);
        if (item->IsObject())
          addItem(item.As<v8::Object>());
      }
    }

    v8::Local<v8::Object> attrs;
    if (v8pp::get_option(isolate, obj, "attrs", attrs)) {
      v8::Local<v8::Array> keys = attrs->GetPropertyNames();
      for (uint32_t i = 0; i < keys->Length(); ++i) {
        v8::Local<v8::Value> key = keys->Get(i);
        const std::string &keyStr =
            v8pp::from_v8<std::string>(isolate, key, "");
        if (!keyStr.empty()) {
          setAttr(keyStr, attrs->Get(key));
        }
      }
    }
  }
}

Item::Item(const Item &item) : d(new Private(*item.d)) {}

Item::~Item() {}

std::string Item::name() const { return d->name; }

void Item::setName(const std::string &name) { d->name = name; }

std::string Item::id() const { return d->id; }

void Item::setId(const std::string &id) { d->id = id; }

std::string Item::range() const { return d->range; }

void Item::setRange(const std::string &range) { d->range = range; }

v8::Local<v8::Object> Item::valueObject() const {
  Isolate *isolate = Isolate::GetCurrent();
  return v8pp::class_<ItemValue>::import_external(isolate,
                                                  new ItemValue(d->value));
}

ItemValue Item::value() const { return d->value; }

void Item::setValue(v8::Local<v8::Object> value) {
  Isolate *isolate = Isolate::GetCurrent();
  if (ItemValue *iv = v8pp::class_<ItemValue>::unwrap_object(isolate, value)) {
    d->value = *iv;
  }
}

std::vector<Item> Item::items() const { return d->items; }

void Item::addItem(v8::Local<v8::Object> obj) {
  Isolate *isolate = Isolate::GetCurrent();
  if (Item *item = v8pp::class_<Item>::unwrap_object(isolate, obj)) {
    d->items.emplace_back(*item);
  } else if (obj->IsObject()) {
    d->items.emplace_back(obj);
  }
}

void Item::setAttr(const std::string &name, v8::Local<v8::Value> obj) {
  Isolate *isolate = Isolate::GetCurrent();
  if (ItemValue *item = v8pp::class_<ItemValue>::unwrap_object(isolate, obj)) {
    d->attrs.emplace(name, *item);
  } else {
    d->attrs.emplace(name, ItemValue(obj));
  }
}

std::unordered_map<std::string, ItemValue> Item::attrs() const {
  return d->attrs;
}
